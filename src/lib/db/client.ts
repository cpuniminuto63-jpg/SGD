import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __revisasgdDbClient: ReturnType<typeof postgres> | undefined;
}

// Vercel Postgres inyecta POSTGRES_URL automáticamente cuando la base de datos está
// vinculada al proyecto. DATABASE_URL queda como alternativa para desarrollo local.
const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

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
