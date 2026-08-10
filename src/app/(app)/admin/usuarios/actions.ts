"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/require-role";
import type { UserRole } from "@/lib/supabase/database.types";

const VALID_ROLES: UserRole[] = ["administrador", "coordinador", "revisor", "consulta"];

function fail(message: string): never {
  redirect(`/admin/usuarios?error=${encodeURIComponent(message)}`);
}

function ok(message: string): never {
  redirect(`/admin/usuarios?success=${encodeURIComponent(message)}`);
}

export async function inviteUser(formData: FormData): Promise<void> {
  await requireRole("administrador");

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as UserRole;

  if (!fullName || !email || !VALID_ROLES.includes(role)) {
    fail("Completa nombre, correo y rol válidos para invitar a un usuario.");
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    fail(
      "No se pudo invitar: falta configurar la variable de entorno SUPABASE_SERVICE_ROLE_KEY " +
        "en este entorno. Contacta a quien administra el despliegue para configurarla."
    );
  }

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });

  if (inviteError || !inviteData?.user) {
    fail(`No se pudo invitar al usuario: ${inviteError?.message ?? "error desconocido"}.`);
  }

  const supabase = await createClient();
  const { error: profileError } = await supabase.from("profiles").insert({
    id: inviteData.user.id,
    full_name: fullName,
    email,
    role,
    active: true,
  });

  if (profileError) {
    fail(`El usuario fue invitado pero no se pudo crear su perfil: ${profileError.message}.`);
  }

  ok(`Se envió la invitación a ${email}.`);
}

export async function toggleActive(formData: FormData): Promise<void> {
  const admin = await requireRole("administrador");
  const supabase = await createClient();

  const profileId = String(formData.get("profile_id") ?? "");
  const currentActive = formData.get("current_active") === "true";

  if (!profileId) {
    fail("Falta el identificador del perfil.");
  }

  const nextActive = !currentActive;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ active: nextActive })
    .eq("id", profileId);

  if (updateError) {
    fail(`No se pudo actualizar el estado del usuario: ${updateError.message}.`);
  }

  await supabase.from("audit_log").insert({
    actor_id: admin.id,
    action: "toggle_active",
    entity: "profiles",
    entity_id: profileId,
    before: { active: currentActive },
    after: { active: nextActive },
  });

  ok(nextActive ? "Usuario reactivado." : "Usuario desactivado.");
}
