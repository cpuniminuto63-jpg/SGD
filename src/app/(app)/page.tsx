import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";

interface KpiCard {
  label: string;
  value: number;
}

async function loadKpis(): Promise<{ cards: KpiCard[]; error: string | null }> {
  const supabase = await createClient();

  const [{ count: sedes, error: sedesError }, { count: pendientes, error: pendientesError }] =
    await Promise.all([
      supabase.from("institutions").select("*", { count: "exact", head: true }),
      supabase
        .from("expected_documents")
        .select("*", { count: "exact", head: true }),
    ]);

  if (sedesError || pendientesError) {
    return { cards: [], error: (sedesError ?? pendientesError)?.message ?? "Error desconocido" };
  }

  return {
    cards: [
      { label: "Sedes activas", value: sedes ?? 0 },
      { label: "Documentos esperados", value: pendientes ?? 0 },
    ],
    error: null,
  };
}

export default async function ResumenGeneralPage() {
  const profile = await getCurrentProfile();
  const { cards, error } = await loadKpis();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Resumen general</h1>
        <p className="text-sm text-foreground-muted">
          Bienvenido/a, {profile.full_name.split(" ")[0]}. Centro de control de la revisión
          documental de las 306 sedes.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
        >
          No se pudieron cargar los indicadores todavía: la base de datos de RevisaSGD no está
          conectada en este entorno ({error}). Configura las variables{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </div>
      ) : cards.every((c) => c.value === 0) ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          Todavía no hay datos importados. Ve a{" "}
          <span className="font-medium text-foreground">Administración → Importación de matrices</span>{" "}
          para cargar la base de sedes y el catálogo documental.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                {card.label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{card.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
