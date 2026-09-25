/* Se ejecuta una sola vez cuando arranca el servidor de Next.js (no en cada
 * request). Falla rápido y con un mensaje claro si falta una variable de entorno
 * crítica, en vez de dejar que la app arranque "a medias" y falle de forma
 * confusa en el primer request que la necesite. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Desde Node 18, la resolución DNS por defecto es "verbatim" (respeta el orden que
  // devuelva el resolvedor, que en muchos contenedores Docker intenta primero un
  // registro AAAA/IPv6 que nunca responde) en vez del "ipv4first" de versiones
  // anteriores. Contra el pooler de Neon esto puede colgar la conexión para siempre
  // SIN lanzar ningún error -- ni siquiera activa connect_timeout, porque el cuelgue
  // pasa antes de intentar conectar el socket, en la resolución del nombre. Forzar
  // ipv4first es el arreglo estándar documentado por Node para este problema.
  const dns = await import("node:dns");
  dns.setDefaultResultOrder("ipv4first");

  const required = ["POSTGRES_URL", "AUTH_SECRET"];
  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    // No lanzamos el error en build (Vercel evalúa este archivo también al construir,
    // antes de inyectar las variables de runtime) — solo avisamos fuerte en logs.
    console.error(
      `⚠️  RevisaSGD: faltan variables de entorno críticas: ${missing.join(", ")}. ` +
        "La app puede arrancar pero fallará al intentar conectarse a la base de datos o validar sesiones."
    );
  }
}
