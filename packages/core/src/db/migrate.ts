// Standalone migration runner: `pnpm --filter @wa/core db:migrate`.
// Applies everything in ./drizzle to the database in DATABASE_URL.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set; cannot run migrations.");
  }

  // A dedicated single connection with prepared statements disabled — the
  // recommended setup for running migrations against the Supabase pooler.
  const migrationClient = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(migrationClient);

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = resolve(here, "../../drizzle");

  console.log(`Running migrations from ${migrationsFolder} ...`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied.");

  await migrationClient.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
