import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Only needed for `drizzle-kit push`/`studio`; `generate` works offline.
    url: process.env.DATABASE_URL ?? "",
  },
  // Supabase adds its own internal schemas; keep migrations to the public schema.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
