"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { profiles, auditLog } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import type { UserRole } from "@/lib/db/types";

const VALID_ROLES: UserRole[] = ["administrador", "coordinador", "revisor", "consulta"];

function fail(message: string): never {
  redirect(`/admin/usuarios?error=${encodeURIComponent(message)}`);
}

function ok(message: string): never {
  redirect(`/admin/usuarios?success=${encodeURIComponent(message)}`);
}

function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}

export async function inviteUser(formData: FormData): Promise<void> {
  await requireRole("administrador");

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as UserRole;

  if (!fullName || !email || !VALID_ROLES.includes(role)) {
    fail("Completa nombre, correo y rol válidos para crear un usuario.");
  }

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

  const profileId = String(formData.get("profile_id") ?? "");
  if (!profileId) {
    fail("Falta el identificador del perfil.");
  }

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

export async function toggleActive(formData: FormData): Promise<void> {
  const admin = await requireRole("administrador");

  const profileId = String(formData.get("profile_id") ?? "");
  const currentActive = formData.get("current_active") === "true";

  if (!profileId) {
    fail("Falta el identificador del perfil.");
  }

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
