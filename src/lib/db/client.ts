import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __revisasgdDbClient: ReturnType<typeof postgres> | undefined;
}

// Vercel Postgres/Neon inyecta POSTGRES_URL y/o DATABASE_URL según cómo se conectó
// la base de datos al proyecto. Se usa `||` (no `??`) a propósito: una variable
// definida pero vacía ("") debe tratarse igual que si no existiera, para no quedar
// atascados en la primera si viene vacía y la segunda sí trae el valor real.
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Falta POSTGRES_URL (o DATABASE_URL). Vincula una base de datos Postgres en Vercel o define la variable en .env.local."
  );
}

// Reutiliza la conexión entre invocaciones en desarrollo (hot reload) para no agotar el pool.
const client =
  globalThis.__revisasgdDbClient ??
  postgres(connectionString, { max: process.env.NODE_ENV === "production" ? 5 : 1 });

if (process.env.NODE_ENV !== "production") {
  globalThis.__revisasgdDbClient = client;
}

export const db = drizzle(client, { schema });
