"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { expectedDocuments, reviewEvents } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { REVIEW_STATUS_META } from "@/lib/review-status";
import type { FindingType, PriorityLevel, ReviewStatus } from "@/lib/db/types";

export async function submitReview(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();

  const expectedDocumentId = String(formData.get("expected_document_id") ?? "");
  const status = String(formData.get("status") ?? "") as ReviewStatus;
  const observation = String(formData.get("observation") ?? "").trim();
  const findingType = (String(formData.get("finding_type") ?? "").trim() || null) as FindingType | null;
  const requiresRemediation = formData.get("requires_remediation") === "on";
  const remediationDueDate = String(formData.get("remediation_due_date") ?? "").trim() || null;
  const priority = (String(formData.get("priority") ?? "").trim() || null) as PriorityLevel | null;
  const fileReference = String(formData.get("file_reference") ?? "").trim() || null;
  const closingComment = String(formData.get("closing_comment") ?? "").trim() || null;
  const next = String(formData.get("next") ?? "");
  const returnTo = String(formData.get("return_to") ?? `/mi-bandeja/${expectedDocumentId}`);

  if (!expectedDocumentId || !status) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("Faltan datos obligatorios para guardar la revisión.")}`);
  }

  const meta = REVIEW_STATUS_META[status];
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
      status,
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

  redirect(next || returnTo);
}
