"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";

function fail(message: string): never {
  redirect(`/mi-cuenta/cambiar-clave?error=${encodeURIComponent(message)}`);
}

function ok(message: string): never {
  redirect(`/mi-cuenta/cambiar-clave?success=${encodeURIComponent(message)}`);
}

export async function changePassword(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();

  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    fail("Completa los tres campos.");
  }

  if (newPassword !== confirmPassword) {
    fail("La contraseña nueva y su confirmación no coinciden.");
  }

  if (newPassword.length < 8) {
    fail("La contraseña nueva debe tener al menos 8 caracteres.");
  }

  if (!profile.passwordHash) {
    fail("Tu cuenta no tiene contraseña configurada. Contacta al administrador.");
  }

  const valid = await bcrypt.compare(currentPassword, profile.passwordHash);
  if (!valid) {
    fail("La contraseña actual no es correcta.");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  try {
    await db.update(profiles).set({ passwordHash, updatedAt: new Date() }).where(eq(profiles.id, profile.id));
  } catch (err) {
    fail(`No se pudo actualizar la contraseña: ${err instanceof Error ? err.message : "error desconocido"}.`);
  }

  ok("Contraseña actualizada correctamente.");
}
