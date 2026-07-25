// Environment configuration for the bot process. Loads .env in local dev;
// on Render the vars are injected directly.
import "dotenv/config";
import { parseAllowlist } from "@wa/core";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export interface BotConfig {
  databaseUrl: string;
  port: number;
  sessionId: string;
  allowlist: Set<string>;
}

export function loadConfig(): BotConfig {
  const databaseUrl = required("DATABASE_URL");
  // These are consumed inside @wa/core clients, but fail fast here too:
  required("OPENAI_API_KEY");

  const allowlist = parseAllowlist(process.env.ALLOWED_PHONES);
  if (allowlist.size === 0) {
    // Per spec, messages from non-allowlisted numbers are ignored. An empty
    // allowlist would ignore everyone — almost certainly a misconfiguration.
    throw new Error(
      "ALLOWED_PHONES is empty. Set a comma-separated E.164 allowlist (testing safety).",
    );
  }

  return {
    databaseUrl,
    port: Number(process.env.PORT ?? 3000),
    sessionId: process.env.BAILEYS_SESSION_ID ?? "default",
    allowlist,
  };
}
