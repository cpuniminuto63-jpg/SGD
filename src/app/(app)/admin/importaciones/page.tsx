import { requireRole } from "@/lib/auth/require-role";
import { InstitutionsImportWizard } from "@/components/import/institutions-import-wizard";
import { CatalogImportWizard } from "@/components/import/catalog-import-wizard";
import { GenerateExpectedDocumentsButton } from "@/components/import/generate-expected-documents-button";

export default async function ImportacionesPage() {
  await requireRole("administrador");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Importación de matrices</h1>
        <p className="text-sm text-foreground-muted">
          Los archivos originales nunca se modifican. Cada importación queda registrada y no borra
          revisiones, observaciones ni comentarios históricos.
        </p>
      </div>

      <InstitutionsImportWizard />
      <CatalogImportWizard />
      <GenerateExpectedDocumentsButton />
    </div>
  );
}
