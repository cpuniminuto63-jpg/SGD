"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";

export async function submitSectionComment(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();
  if (!["administrador", "coordinador", "revisor"].includes(profile.role)) {
    redirect("/?error=No%20tienes%20permiso%20para%20comentar%20apartados.");
  }

  const supabase = await createClient();

  const institutionId = String(formData.get("institution_id") ?? "");
  const sectionId = String(formData.get("section_id") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  const returnTo = String(
    formData.get("return_to") ?? `/sedes/${institutionId}/comentarios/${sectionId}`
  );

  if (!institutionId || !sectionId || !comment) {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        "El comentario no puede estar vacío."
      )}`
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("section_comments")
    .select("version")
    .eq("institution_id", institutionId)
    .eq("section_id", sectionId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        `No se pudo calcular la versión del comentario: ${existingError.message}`
      )}`
    );
  }

  const nextVersion = ((existing as { version: number } | null)?.version ?? 0) + 1;

  const { error } = await supabase.from("section_comments").insert({
    institution_id: institutionId,
    section_id: sectionId,
    author_id: profile.id,
    comment,
    version: nextVersion,
  });

  if (error) {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        `No se pudo guardar el comentario: ${error.message}`
      )}`
    );
  }

  redirect(returnTo);
}
