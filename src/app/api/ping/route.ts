import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { profilePings } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

// Cuánta gente usa la app al tiempo, para dimensionar infraestructura — no para nada
// de negocio. Un proceso Node persistente (no serverless), así que este mapa en
// memoria es suficiente para no escribir en la base en cada clic: solo un latido
// cada ~2 minutos por persona activa.
const lastPingByProfile = new Map<string, number>();
const THROTTLE_MS = 2 * 60 * 1000;

export async function POST() {
  const session = await auth();
  const profileId = session?.user?.id;
  if (!profileId) return new Response(null, { status: 204 });

  const now = Date.now();
  const last = lastPingByProfile.get(profileId);
  if (!last || now - last > THROTTLE_MS) {
    lastPingByProfile.set(profileId, now);
    await db.insert(profilePings).values({ profileId });
  }

  return new Response(null, { status: 204 });
}
