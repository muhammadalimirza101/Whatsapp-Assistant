// Postgres connection for the long-running bot process.
// Uses the Supabase pooler in SESSION mode (DATABASE_URL, port 5432).
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set (Supabase pooler, session mode).");
}

// One shared pool for the process. `prepare: false` keeps us compatible with
// Supabase's connection pooler regardless of pool mode.
export const sql = postgres(connectionString, {
  max: 10,
  prepare: false,
});

export const db = drizzle(sql, { schema });

export type Db = typeof db;
export { schema };
