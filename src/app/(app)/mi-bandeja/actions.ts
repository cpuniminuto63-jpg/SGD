"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { expectedDocuments, reviewEvents, institutions } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { REVIEW_STATUS_META } from "@/lib/review-status";
import type { FindingType, PriorityLevel, ReviewStatus } from "@/lib/db/types";

const REVIEW_SCHEMA = z.object({
  expected_document_id: z.uuid(),
  status: z.enum(["pendiente_revision", "no_esta", "pendiente_subsanar", "volver_a_campo", "cumple", "no_aplica", "reemplazado"]),
  observation: z.string().trim().max(4000).optional().default(""),
  finding_type: z.string().trim().max(100).optional().default(""),
  requires_remediation: z.string().optional(),
  remediation_due_date: z.string().trim().max(20).optional().default(""),
  priority: z.string().trim().max(20).optional().default(""),
  file_reference: z.string().trim().max(2000).optional().default(""),
  closing_comment: z.string().trim().max(4000).optional().default(""),
  next: z.string().trim().max(2000).optional().default(""),
  return_to: z.string().trim().max(2000).optional(),
});

export async function submitReview(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();

  const raw = Object.fromEntries(formData.entries());
  const parsed = REVIEW_SCHEMA.safeParse(raw);
  const fallbackReturnTo = "/mi-bandeja";
  if (!parsed.success) {
    redirect(`${fallbackReturnTo}?error=${encodeURIComponent("Datos inválidos para guardar la revisión.")}`);
  }

  const {
    expected_document_id: expectedDocumentId,
    status,
    observation,
    finding_type: findingTypeRaw,
    requires_remediation: requiresRemediationRaw,
    remediation_due_date: remediationDueDateRaw,
    priority: priorityRaw,
    file_reference: fileReferenceRaw,
    closing_comment: closingCommentRaw,
    next,
  } = parsed.data;

  const findingType = (findingTypeRaw || null) as FindingType | null;
  const requiresRemediation = requiresRemediationRaw === "on";
  const remediationDueDate = remediationDueDateRaw || null;
  const priority = (priorityRaw || null) as PriorityLevel | null;
  const fileReference = fileReferenceRaw || null;
  const closingComment = closingCommentRaw || null;
  const returnTo = parsed.data.return_to || `/mi-bandeja/${expectedDocumentId}`;
  const statusValue = status as ReviewStatus;

  const meta = REVIEW_STATUS_META[statusValue];
  if (meta?.requiresObservation && !observation) {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        `El estado "${meta.label}" requiere una observación.`
      )}`
    );
  }

  // Verificación de seguridad: sin RLS de respaldo, un revisor no puede registrar una
  // revisión para un documento de una sede fuera de su alcance, aunque construya el
  // formulario a mano.
  const ids = await visibleInstitutionIds(profile);
  if (ids !== null) {
    const [doc] = await db
      .select({ institutionId: expectedDocuments.institutionId })
      .from(expectedDocuments)
      .where(eq(expectedDocuments.id, expectedDocumentId))
      .limit(1);

    if (!doc || !ids.includes(doc.institutionId)) {
      redirect(
        `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(
          "No tienes permiso para revisar este documento."
        )}`
      );
    }
  }

  try {
    await db.insert(reviewEvents).values({
      expectedDocumentId,
      reviewerId: profile.id,
      status: statusValue,
      observation: observation || null,
      findingType,
      requiresRemediation,
      remediationDueDate,
      priority,
      fileReference,
      closingComment,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        `No se pudo guardar la revisión: ${message}`
      )}`
    );
  }

  await clearReReviewMark(expectedDocumentId);

  redirect(next || returnTo);
}

/** Si la coordinación había pedido "volver a revisar" esta sede (ver
 * sedes/[institutionId]/actions.ts → requestReReview), quita este documento de la
 * lista de pendientes; al vaciarse, limpia la marca sola. Solo una alerta — nunca
 * toca el estado del documento en sí. */
async function clearReReviewMark(expectedDocumentId: string): Promise<void> {
  const [doc] = await db
    .select({ institutionId: expectedDocuments.institutionId })
    .from(expectedDocuments)
    .where(eq(expectedDocuments.id, expectedDocumentId))
    .limit(1);
  if (!doc) return;

  const [sede] = await db
    .select({ pending: institutions.reReviewPendingDocumentIds })
    .from(institutions)
    .where(eq(institutions.id, doc.institutionId))
    .limit(1);
  if (!sede?.pending || sede.pending.length === 0) return;

  const remaining = sede.pending.filter((id) => id !== expectedDocumentId);
  if (remaining.length === sede.pending.length) return; // este documento no estaba en la lista

  if (remaining.length === 0) {
    await db
      .update(institutions)
      .set({ reReviewRequestedAt: null, reReviewRequestedBy: null, reReviewPendingDocumentIds: null })
      .where(eq(institutions.id, doc.institutionId));
  } else {
    await db
      .update(institutions)
      .set({ reReviewPendingDocumentIds: remaining })
      .where(eq(institutions.id, doc.institutionId));
  }
}
