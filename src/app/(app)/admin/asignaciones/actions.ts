"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reviewerAssignments } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";

function fail(returnTo: string, message: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}error=${encodeURIComponent(message)}`);
}

export async function toggleAssignment(formData: FormData): Promise<void> {
  const admin = await requireRole("administrador");

  const profileId = String(formData.get("profile_id") ?? "");
  const institutionId = String(formData.get("institution_id") ?? "");
  const shouldAssign = String(formData.get("next_action") ?? "") === "assign";
  const returnTo = String(formData.get("return_to") ?? "/admin/asignaciones");

  if (!profileId || !institutionId) {
    fail(returnTo, "Faltan datos para actualizar la asignación.");
  }

  let existing;
  try {
    [existing] = await db
      .select({ id: reviewerAssignments.id, active: reviewerAssignments.active })
      .from(reviewerAssignments)
      .where(and(eq(reviewerAssignments.profileId, profileId), eq(reviewerAssignments.institutionId, institutionId)))
      .limit(1);
  } catch (err) {
    fail(returnTo, `No se pudo verificar la asignación existente: ${err instanceof Error ? err.message : "error desconocido"}.`);
  }

  try {
    if (shouldAssign) {
      if (existing) {
        await db
          .update(reviewerAssignments)
          .set({ active: true, assignedBy: admin.id, assignedAt: new Date() })
          .where(eq(reviewerAssignments.id, existing.id));
      } else {
        await db.insert(reviewerAssignments).values({
          profileId,
          institutionId,
          assignedBy: admin.id,
          active: true,
        });
      }
    } else if (existing) {
      await db.update(reviewerAssignments).set({ active: false }).where(eq(reviewerAssignments.id, existing.id));
    }
  } catch (err) {
    fail(
      returnTo,
      `No se pudo actualizar la asignación: ${err instanceof Error ? err.message : "error desconocido"}.`
    );
  }

  redirect(returnTo);
}
