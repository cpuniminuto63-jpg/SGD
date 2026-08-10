"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require-role";

function fail(returnTo: string, message: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}error=${encodeURIComponent(message)}`);
}

export async function toggleAssignment(formData: FormData): Promise<void> {
  const admin = await requireRole("administrador");
  const supabase = await createClient();

  const profileId = String(formData.get("profile_id") ?? "");
  const institutionId = String(formData.get("institution_id") ?? "");
  const shouldAssign = String(formData.get("next_action") ?? "") === "assign";
  const returnTo = String(formData.get("return_to") ?? "/admin/asignaciones");

  if (!profileId || !institutionId) {
    fail(returnTo, "Faltan datos para actualizar la asignación.");
  }

  const { data: existing, error: findError } = await supabase
    .from("reviewer_assignments")
    .select("id, active")
    .eq("profile_id", profileId)
    .eq("institution_id", institutionId)
    .maybeSingle();

  if (findError) {
    fail(returnTo, `No se pudo verificar la asignación existente: ${findError.message}.`);
  }

  if (shouldAssign) {
    if (existing) {
      const { error } = await supabase
        .from("reviewer_assignments")
        .update({ active: true, assigned_by: admin.id, assigned_at: new Date().toISOString() })
        .eq("id", existing.id as string);
      if (error) fail(returnTo, `No se pudo asignar la sede: ${error.message}.`);
    } else {
      const { error } = await supabase.from("reviewer_assignments").insert({
        profile_id: profileId,
        institution_id: institutionId,
        assigned_by: admin.id,
        active: true,
      });
      if (error) fail(returnTo, `No se pudo asignar la sede: ${error.message}.`);
    }
  } else if (existing) {
    const { error } = await supabase
      .from("reviewer_assignments")
      .update({ active: false })
      .eq("id", existing.id as string);
    if (error) fail(returnTo, `No se pudo quitar la asignación: ${error.message}.`);
  }

  redirect(returnTo);
}
