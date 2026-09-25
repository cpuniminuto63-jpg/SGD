import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __revisasgdDbClient: ReturnType<typeof postgres> | undefined;
}

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let realDb: DrizzleDb | undefined;

// La conexión se crea perezosamente (al primer uso real), no al importar el módulo.
// Next.js evalúa los módulos de las rutas durante el build (p. ej. para recolectar
// metadata de /api/auth/[...nextauth]), momento en el que Vercel todavía no expone
// las variables de entorno de runtime (POSTGRES_URL/DATABASE_URL) — solo lo hace
// cuando la función realmente se ejecuta. Lanzar el error en tiempo de importación
// rompía el build entero; ahora solo se lanza si alguien intenta consultar la base
// de datos sin la variable configurada.
function getRealDb(): DrizzleDb {
  if (realDb) return realDb;

  // Se usa `||` (no `??`) a propósito: una variable definida pero vacía ("") debe
  // tratarse igual que si no existiera, para no quedar atascados en la primera si
  // viene vacía y la segunda sí trae el valor real.
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Falta POSTGRES_URL (o DATABASE_URL). Vincula una base de datos Postgres en Vercel o define la variable en .env.local."
    );
  }

  // Reutiliza la conexión entre invocaciones en desarrollo (hot reload) para no agotar el pool.
  // `prepare: false` es obligatorio contra el endpoint "-pooler" de Neon (PgBouncer en modo
  // transacción): los statements preparados no sobreviven entre transacciones agrupadas y
  // fallan de forma intermitente y difícil de diagnosticar si se dejan activados.
  const client =
    globalThis.__revisasgdDbClient ??
    postgres(connectionString, {
      max: process.env.NODE_ENV === "production" ? 5 : 1,
      prepare: false,
      // Sin esto, un intento de conexión que se cuelga (p. ej. un DNS/red intermitente
      // hacia Neon, algo que ya pasó varias veces con este proyecto) se queda esperando
      // PARA SIEMPRE -- no hay valor por defecto. statement_timeout de abajo solo limita
      // el tiempo de una consulta ya conectada, no el de establecer la conexión.
      connect_timeout: 10,
      // Neon suspende el cómputo por inactividad (autoscale-to-zero). Sin esto, una
      // conexión del pool que quedó ociosa puede seguir apuntando a un backend que
      // Neon ya cerró o está por suspender, y el siguiente uso falla de forma
      // intermitente en vez de reciclarse proactivamente antes de que eso pase.
      idle_timeout: 20,
      // Sin esto, una sola consulta colgada se queda con una de las 5 conexiones del
      // pool para siempre (statement_timeout está en 0 = sin límite a nivel de Neon).
      // Con el pool tan chico, 5 consultas lentas simultáneas ya tumban una instancia.
      connection: {
        statement_timeout: 15_000,
      },
    });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__revisasgdDbClient = client;
  }

  realDb = drizzle(client, { schema });
  return realDb;
}

export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getRealDb() as object, prop, receiver);
  },
});
