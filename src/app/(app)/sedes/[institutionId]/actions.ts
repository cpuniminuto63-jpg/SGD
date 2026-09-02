"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { institutions, expectedDocuments } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { getSedeAndApartadoStatusMaps } from "@/lib/sede-status";

const ID_SCHEMA = z.object({ institution_id: z.uuid() });

function fail(institutionId: string, message: string): never {
  redirect(`/sedes/${institutionId}?error=${encodeURIComponent(message)}`);
}

/** Verifica que la sede esté dentro del alcance visible de este perfil; si no, corta
 * con el mismo error genérico que usa el resto de la app (nunca revela si la sede
 * existe cuando el usuario no tiene acceso). */
async function assertVisible(institutionId: string): Promise<void> {
  const profile = await getCurrentProfile();
  const ids = await visibleInstitutionIds(profile);
  if (ids !== null && !ids.includes(institutionId)) {
    fail(institutionId, "No tienes permiso sobre esta sede.");
  }
}

/**
 * Coordinación: marca la sede para que el revisor asignado vuelva a dejar veredicto
 * en los documentos que no están en "Cumple". Solo deja una alerta — no reinicia el
 * estado de ningún documento (a pedido del usuario, 2026-09-01). Se limpia sola cuando
 * llega un review_event nuevo para cada uno de esos documentos (ver mi-bandeja/actions.ts).
 */
export async function requestReReview(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();
  if (profile.role !== "administrador" && profile.role !== "coordinador") {
    redirect("/?error=No%20tienes%20permiso%20para%20esa%20acción.");
  }

  const parsed = ID_SCHEMA.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/?error=Solicitud%20inválida.");
  const { institution_id: institutionId } = parsed.data;

  await assertVisible(institutionId);

  const { apartadoStatusMap } = await getSedeAndApartadoStatusMaps([institutionId]);
  const noCumpleKeys = [...apartadoStatusMap.entries()].filter(([, status]) => status !== "cumple");
  if (noCumpleKeys.length === 0) {
    fail(institutionId, "Esta sede no tiene apartados pendientes — todos están en Cumple.");
  }

  // Todos los documentos (no solo los obligatorios) de esos apartados, para que el
  // revisor los vea limpiarse de la lista de pendientes a medida que los revisa.
  const noCumpleSectionSet = new Set(noCumpleKeys.map(([key]) => key.split("|")[1]));
  const docs = await db
    .select({ id: expectedDocuments.id, sectionId: expectedDocuments.sectionId })
    .from(expectedDocuments)
    .where(eq(expectedDocuments.institutionId, institutionId));
  const pendingDocIds = docs.filter((d) => noCumpleSectionSet.has(d.sectionId)).map((d) => d.id);

  try {
    await db
      .update(institutions)
      .set({
        reReviewRequestedAt: new Date(),
        reReviewRequestedBy: profile.id,
        reReviewPendingDocumentIds: pendingDocIds,
      })
      .where(eq(institutions.id, institutionId));
  } catch (err) {
    fail(institutionId, `No se pudo registrar la marca: ${err instanceof Error ? err.message : "error desconocido"}.`);
  }

  redirect(`/sedes/${institutionId}?success=${encodeURIComponent("Se avisó al revisor que vuelva a revisar esta sede.")}`);
}

/** Rol "sgd": marca la sede como pasada a la siguiente etapa, "Traslado EAFIT". Solo
 * puede hacerlo sobre sedes que ya están en su bandeja (trasladado_sgd sin marcar
 * todavía) — visibleInstitutionIds ya filtra eso. */
export async function markTrasladoEafit(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();
  if (profile.role !== "administrador" && profile.role !== "sgd") {
    redirect("/?error=No%20tienes%20permiso%20para%20esa%20acción.");
  }

  const parsed = ID_SCHEMA.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/?error=Solicitud%20inválida.");
  const { institution_id: institutionId } = parsed.data;

  await assertVisible(institutionId);

  try {
    await db
      .update(institutions)
      .set({ traspasoEafitAt: new Date(), traspasoEafitBy: profile.id })
      .where(eq(institutions.id, institutionId));
  } catch (err) {
    fail(institutionId, `No se pudo marcar el traslado: ${err instanceof Error ? err.message : "error desconocido"}.`);
  }

  redirect(`/sedes/${institutionId}?success=${encodeURIComponent("Sede marcada como Traslado EAFIT.")}`);
}

/** Rol "coordinador_eafit": marca la sede como entregada a CPE — última etapa de la
 * cadena. Solo sobre sedes que ya llegaron a "Traslado EAFIT" (visibleInstitutionIds
 * ya filtra eso). */
export async function markEntregadoCpe(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();
  if (profile.role !== "administrador" && profile.role !== "coordinador_eafit") {
    redirect("/?error=No%20tienes%20permiso%20para%20esa%20acción.");
  }

  const parsed = ID_SCHEMA.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/?error=Solicitud%20inválida.");
  const { institution_id: institutionId } = parsed.data;

  await assertVisible(institutionId);

  const [sede] = await db
    .select({ traspasoEafitAt: institutions.traspasoEafitAt })
    .from(institutions)
    .where(eq(institutions.id, institutionId))
    .limit(1);
  if (!sede?.traspasoEafitAt) {
    fail(institutionId, "Esta sede todavía no pasó por Traslado EAFIT.");
  }

  try {
    await db
      .update(institutions)
      .set({ entregadoCpeAt: new Date(), entregadoCpeBy: profile.id })
      .where(eq(institutions.id, institutionId));
  } catch (err) {
    fail(institutionId, `No se pudo marcar la entrega: ${err instanceof Error ? err.message : "error desconocido"}.`);
  }

  redirect(`/sedes/${institutionId}?success=${encodeURIComponent("Sede marcada como Entregado a CPE.")}`);
}
