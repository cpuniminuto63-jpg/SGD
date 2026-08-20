"use server";

import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sectionComments, sectionReviews } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import type { ReviewStatus } from "@/lib/db/types";

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

/**
 * Veredicto manual por apartado completo (Cumple / Pendiente por subsanar / etc.),
 * más rápido que revisar documento por documento. Insert-only, igual que review_events:
 * el estado vigente del apartado es el último veredicto registrado.
 */
export async function submitSectionReview(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();
  if (!["administrador", "coordinador", "revisor"].includes(profile.role)) {
    redirect("/?error=No%20tienes%20permiso%20para%20revisar%20apartados.");
  }

  const institutionId = String(formData.get("institution_id") ?? "");
  const sectionId = String(formData.get("section_id") ?? "");
  const status = String(formData.get("status") ?? "") as ReviewStatus;
  const comment = String(formData.get("comment") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? `/sedes/${institutionId}`);

  if (!institutionId || !sectionId || !status) {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        "Faltan datos para guardar el comentario del apartado."
      )}`
    );
  }
  // El estado ya no lo elige la persona (se calcula solo desde los documentos, ver
  // src/lib/sede-status.ts) — este formulario ahora es solo para dejar un comentario
  // general opcional, así que no se exige comentario según el estado.

  // Sin RLS de respaldo: verificar visibilidad antes de insertar.
  const visibleIds = await visibleInstitutionIds(profile);
  if (visibleIds !== null && !visibleIds.includes(institutionId)) {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        "No tienes acceso a esta sede."
      )}`
    );
  }

  try {
    await db.insert(sectionReviews).values({
      institutionId,
      sectionId,
      status,
      comment: comment || null,
      reviewerId: profile.id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        `No se pudo guardar el veredicto del apartado: ${message}`
      )}`
    );
  }

  redirect(returnTo);
}
