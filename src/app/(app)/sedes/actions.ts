"use server";

import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { sectionComments, sectionReviews } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import type { ReviewStatus } from "@/lib/db/types";

const COMMENT_SCHEMA = z.object({
  institution_id: z.uuid(),
  section_id: z.uuid(),
  comment: z.string().trim().min(1).max(4000),
  return_to: z.string().trim().max(2000).optional(),
});

const SECTION_REVIEW_SCHEMA = z.object({
  institution_id: z.uuid(),
  section_id: z.uuid(),
  status: z.enum(["pendiente_revision", "no_esta", "pendiente_subsanar", "volver_a_campo", "cumple", "no_aplica", "reemplazado"]),
  comment: z.string().trim().max(4000).optional().default(""),
  return_to: z.string().trim().max(2000).optional(),
});

export async function submitSectionComment(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();
  if (!["administrador", "coordinador", "revisor"].includes(profile.role)) {
    redirect("/?error=No%20tienes%20permiso%20para%20comentar%20apartados.");
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = COMMENT_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    const fallback = String(raw.return_to ?? "/sedes");
    redirect(`${fallback}${fallback.includes("?") ? "&" : "?"}error=${encodeURIComponent("El comentario no es válido o está vacío.")}`);
  }
  const { institution_id: institutionId, section_id: sectionId, comment } = parsed.data;
  const returnTo = parsed.data.return_to || `/sedes/${institutionId}/comentarios/${sectionId}`;

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
 * Comentario general opcional por apartado completo. El estado ya no se elige
 * a mano — se calcula solo desde los documentos (ver src/lib/sede-status.ts) — así
 * que este formulario solo persiste contexto adicional.
 */
export async function submitSectionReview(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();
  if (!["administrador", "coordinador", "revisor"].includes(profile.role)) {
    redirect("/?error=No%20tienes%20permiso%20para%20revisar%20apartados.");
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = SECTION_REVIEW_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    const fallback = String(raw.return_to ?? "/sedes");
    redirect(`${fallback}${fallback.includes("?") ? "&" : "?"}error=${encodeURIComponent("Datos inválidos para guardar el comentario del apartado.")}`);
  }
  const { institution_id: institutionId, section_id: sectionId, comment } = parsed.data;
  const status = parsed.data.status as ReviewStatus;
  const returnTo = parsed.data.return_to || `/sedes/${institutionId}`;

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
