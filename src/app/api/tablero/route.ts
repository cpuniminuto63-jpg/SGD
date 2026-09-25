// GET /api/tablero -- datos del Dashboard (pestaña "Dashboard").
// No consulta la base en cada request: lee el reporte precargado (lib/tablero/cache.ts,
// recalculado solo cada 5 horas) y solo filtra en memoria al alcance visible del perfil
// autenticado (el mismo que usan el Resumen general y el Explorador de sedes).
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { getFullTablero, refreshTableroNow, scopeTablero } from "@/lib/tablero/cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "No autenticado." }, { status: 401 });
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, session.user.id)).limit(1);
  if (!profile || !profile.active) {
    return Response.json({ error: "Cuenta inválida o inactiva." }, { status: 403 });
  }

  try {
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    if (forceRefresh && profile.role !== "administrador") {
      return Response.json({ error: "Solo un administrador puede forzar la actualización." }, { status: 403 });
    }

    const [ids, full] = await Promise.all([
      visibleInstitutionIds(profile),
      forceRefresh ? refreshTableroNow() : getFullTablero(),
    ]);
    const data = scopeTablero(full.data, ids);
    return Response.json(
      { ...data, computedAt: new Date(full.computedAt).toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 });
  }
}
