"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { profiles, auditLog } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import type { UserRole } from "@/lib/db/types";

const ROLE_SCHEMA = z.enum(["administrador", "coordinador", "revisor", "consulta", "sgd", "coordinador_eafit"]);
const UUID_SCHEMA = z.uuid();

const INVITE_SCHEMA = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.email().max(320).transform((v) => v.trim().toLowerCase()),
  role: ROLE_SCHEMA,
});
const PROFILE_ID_SCHEMA = z.object({ profile_id: UUID_SCHEMA });
const CHANGE_ROLE_SCHEMA = z.object({
  profile_id: UUID_SCHEMA,
  role: ROLE_SCHEMA,
  current_role: ROLE_SCHEMA,
});
const TOGGLE_ACTIVE_SCHEMA = z.object({
  profile_id: UUID_SCHEMA,
  current_active: z.enum(["true", "false"]),
});

function fail(message: string): never {
  redirect(`/admin/usuarios?error=${encodeURIComponent(message)}`);
}

function ok(message: string): never {
  redirect(`/admin/usuarios?success=${encodeURIComponent(message)}`);
}

/** Valida un FormData contra un esquema Zod; si falla, redirige con un mensaje
 * genérico (nunca el detalle interno de Zod) — evita filas de datos malformados
 * o intencionalmente maliciosos (IDOR con UUID inventado, campos gigantes, etc.). */
function parseOrFail<T extends z.ZodTypeAny>(schema: T, formData: FormData): z.infer<T> {
  const raw = Object.fromEntries(formData.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    fail("Datos inválidos en el formulario. Revisa los campos e intenta de nuevo.");
  }
  return result.data;
}

function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}

export async function inviteUser(formData: FormData): Promise<void> {
  await requireRole("administrador");
  const { full_name: fullName, email, role } = parseOrFail(INVITE_SCHEMA, formData);

  const [existing] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1);
  if (existing) {
    fail(`Ya existe una cuenta con el correo ${email}.`);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  try {
    await db.insert(profiles).values({ fullName, email, passwordHash, role, active: true });
  } catch (err) {
    fail(`No se pudo crear el usuario: ${err instanceof Error ? err.message : "error desconocido"}.`);
  }

  ok(
    `Cuenta creada para ${email}. Contraseña temporal: ${tempPassword} (cópiala ahora, no se volverá a mostrar). ` +
      "Compártela con la persona por un canal seguro; podrá cambiarla en Mi cuenta → Cambiar contraseña."
  );
}

export async function resetPassword(formData: FormData): Promise<void> {
  const admin = await requireRole("administrador");
  const { profile_id: profileId } = parseOrFail(PROFILE_ID_SCHEMA, formData);

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile) {
    fail("No se encontró el usuario indicado.");
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  try {
    await db.update(profiles).set({ passwordHash, updatedAt: new Date() }).where(eq(profiles.id, profileId));
  } catch (err) {
    fail(`No se pudo restablecer la contraseña: ${err instanceof Error ? err.message : "error desconocido"}.`);
  }

  await db.insert(auditLog).values({
    actorId: admin.id,
    action: "reset_password",
    entity: "profiles",
    entityId: profileId,
    before: null,
    after: null,
  });

  ok(
    `Contraseña restablecida para ${profile.email}. Contraseña temporal: ${tempPassword} ` +
      "(cópiala ahora, no se volverá a mostrar)."
  );
}

export async function changeRole(formData: FormData): Promise<void> {
  const admin = await requireRole("administrador");
  const { profile_id: profileId, role: newRole, current_role: currentRole } = parseOrFail(CHANGE_ROLE_SCHEMA, formData);

  if (newRole === currentRole) {
    ok("El rol no cambió.");
  }

  try {
    await db.update(profiles).set({ role: newRole, updatedAt: new Date() }).where(eq(profiles.id, profileId));
  } catch (err) {
    fail(`No se pudo cambiar el rol: ${err instanceof Error ? err.message : "error desconocido"}.`);
  }

  await db.insert(auditLog).values({
    actorId: admin.id,
    action: "change_role",
    entity: "profiles",
    entityId: profileId,
    before: { role: currentRole },
    after: { role: newRole },
  });

  ok(`Rol actualizado a ${newRole}.`);
}

export async function deleteUser(formData: FormData): Promise<void> {
  const admin = await requireRole("administrador");
  const { profile_id: profileId } = parseOrFail(PROFILE_ID_SCHEMA, formData);

  if (profileId === admin.id) {
    fail("No puedes eliminar tu propia cuenta.");
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile) {
    fail("No se encontró el usuario indicado.");
  }

  try {
    await db.delete(profiles).where(eq(profiles.id, profileId));
  } catch {
    // Falla por diseño si la persona ya dejó revisiones, comentarios o exportaciones
    // (esas tablas no tienen ON DELETE CASCADE hacia profiles a propósito, para no
    // perder el historial inmutable). En ese caso, desactivar es la opción correcta.
    fail(
      `No se pudo eliminar a ${profile.fullName}: ya tiene historial registrado (revisiones, comentarios o exportaciones). ` +
        "Usa \"Desactivar\" en su lugar para retirarle el acceso sin perder ese historial."
    );
  }

  await db.insert(auditLog).values({
    actorId: admin.id,
    action: "delete_user",
    entity: "profiles",
    entityId: profileId,
    before: { fullName: profile.fullName, email: profile.email, role: profile.role },
    after: null,
  });

  ok(`Usuario ${profile.fullName} eliminado.`);
}

export async function toggleActive(formData: FormData): Promise<void> {
  const admin = await requireRole("administrador");
  const { profile_id: profileId, current_active: currentActiveRaw } = parseOrFail(TOGGLE_ACTIVE_SCHEMA, formData);
  const currentActive = currentActiveRaw === "true";
  const nextActive = !currentActive;

  try {
    await db.update(profiles).set({ active: nextActive, updatedAt: new Date() }).where(eq(profiles.id, profileId));
  } catch (err) {
    fail(`No se pudo actualizar el estado del usuario: ${err instanceof Error ? err.message : "error desconocido"}.`);
  }

  await db.insert(auditLog).values({
    actorId: admin.id,
    action: "toggle_active",
    entity: "profiles",
    entityId: profileId,
    before: { active: currentActive },
    after: { active: nextActive },
  });

  ok(nextActive ? "Usuario reactivado." : "Usuario desactivado.");
}
