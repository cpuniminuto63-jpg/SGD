// GET /api/tablero -- datos en vivo del Tablero (pestaña "Dashboard").
// A diferencia del paquete original no hay archivos de corte: se calcula directo de
// la base de datos, restringido a las sedes visibles para el perfil autenticado (el
// mismo alcance que usan el Resumen general y el Explorador de sedes).
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { buildTableroFromDb } from "@/lib/tablero/build";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "No autenticado." }, { status: 401 });
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, session.user.id)).limit(1);
  if (!profile || !profile.active) {
    return Response.json({ error: "Cuenta inválida o inactiva." }, { status: 403 });
  }

  try {
    const ids = await visibleInstitutionIds(profile);
    const data = await buildTableroFromDb(ids);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 });
  }
}
