"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documentCatalog, auditLog } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";

function parseCsvList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export async function updateCatalogEntry(formData: FormData): Promise<void> {
  const profile = await requireRole("administrador");

  const id = String(formData.get("id") ?? "");
  const required = formData.get("required") === "true";
  const allowedExtensions = parseCsvList(String(formData.get("allowed_extensions") ?? ""));
  const allowedNamingPatterns = String(formData.get("allowed_naming_patterns") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!id) {
    redirect(`/admin/catalogo?error=${encodeURIComponent("Falta el identificador de la entrada.")}`);
  }

  try {
    const [before] = await db.select().from(documentCatalog).where(eq(documentCatalog.id, id)).limit(1);

    await db
      .update(documentCatalog)
      .set({ required, allowedExtensions, allowedNamingPatterns })
      .where(eq(documentCatalog.id, id));

    await db.insert(auditLog).values({
      actorId: profile.id,
      action: "editar_regla_catalogo",
      entity: "document_catalog",
      entityId: id,
      before: before ? { required: before.required, allowedExtensions: before.allowedExtensions, allowedNamingPatterns: before.allowedNamingPatterns } : null,
      after: { required, allowedExtensions, allowedNamingPatterns },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    redirect(`/admin/catalogo?error=${encodeURIComponent(`No se pudo guardar el cambio: ${message}`)}`);
  }

  redirect("/admin/catalogo?success=Regla%20actualizada.");
}
