"use server";

import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sectionComments } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";

export async function submitSectionComment(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();
  if (!["administrador", "coordinador", "revisor"].includes(profile.role)) {
    redirect("/?error=No%20tienes%20permiso%20para%20comentar%20apartados.");
  }

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

  // Sin RLS a nivel de base de datos: hay que verificar aquí que la sede es visible
  // para el usuario actual antes de insertar el comentario (ver visible-institutions.ts).
  const visibleIds = await visibleInstitutionIds(profile);
  if (visibleIds !== null && !visibleIds.includes(institutionId)) {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        "No tienes acceso a esta sede."
      )}`
    );
  }

  try {
    const [existing] = await db
      .select({ version: sectionComments.version })
      .from(sectionComments)
      .where(and(eq(sectionComments.institutionId, institutionId), eq(sectionComments.sectionId, sectionId)))
      .orderBy(desc(sectionComments.version))
      .limit(1);

    const nextVersion = (existing?.version ?? 0) + 1;

    await db.insert(sectionComments).values({
      institutionId,
      sectionId,
      authorId: profile.id,
      comment,
      version: nextVersion,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        `No se pudo guardar el comentario: ${message}`
      )}`
    );
  }

  redirect(returnTo);
}
