"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { REVIEW_STATUS_META } from "@/lib/review-status";
import type { FindingType, PriorityLevel, ReviewStatus } from "@/lib/supabase/database.types";

export async function submitReview(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();
  const supabase = await createClient();

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

  const { error } = await supabase.from("review_events").insert({
    expected_document_id: expectedDocumentId,
    reviewer_id: profile.id,
    status,
    observation: observation || null,
    finding_type: findingType,
    requires_remediation: requiresRemediation,
    remediation_due_date: remediationDueDate,
    priority,
    file_reference: fileReference,
    closing_comment: closingComment,
  });

  if (error) {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        `No se pudo guardar la revisión: ${error.message}`
      )}`
    );
  }

  redirect(next || returnTo);
}
