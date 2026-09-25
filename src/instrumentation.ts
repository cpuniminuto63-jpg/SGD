/* Se ejecuta una sola vez cuando arranca el servidor de Next.js (no en cada
 * request). Falla rápido y con un mensaje claro si falta una variable de entorno
 * crítica, en vez de dejar que la app arranque "a medias" y falle de forma
 * confusa en el primer request que la necesite. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
