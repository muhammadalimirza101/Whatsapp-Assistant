// Self-contained OAuth helpers for the Vercel functions. Deliberately does NOT
// import @wa/core — Vercel builds each function by tracing its imports, and a
// workspace-package import was preventing the functions from being emitted.
// These talk to Postgres + Google directly using the same tables as the bot.
import postgres from "postgres";
import { google } from "googleapis";

let _sql: ReturnType<typeof postgres> | null = null;
function sql(): ReturnType<typeof postgres> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");
    _sql = postgres(url, { max: 1, prepare: false });
  }
  return _sql;
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export function makeOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth env not fully set.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildConsentUrl(state: string): string {
  return makeOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

/** Consume a state row: returns userId if valid+unexpired, else null. Single use. */
export async function consumeOAuthState(state: string): Promise<string | null> {
  const db = sql();
  const rows = await db<{ user_id: string; expires_at: Date }[]>`
    select user_id, expires_at from oauth_states where state = ${state} limit 1`;
  await db`delete from oauth_states where state = ${state}`;
  await db`delete from oauth_states where expires_at < now()`;
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.user_id;
}

/** Create a fresh state token bound to a user (used to keep it single-use). */
export async function createOAuthState(userId: string): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  const state = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await sql()`
    insert into oauth_states (state, user_id, provider, expires_at)
    values (${state}, ${userId}, 'google', ${expiresAt})`;
  return state;
}

export async function upsertGoogleTokens(input: {
  userId: string;
  accessToken?: string | null;
  refreshToken: string;
  expiresAt?: Date | null;
  scopes?: string[];
}): Promise<void> {
  const expiresIso = input.expiresAt ? input.expiresAt.toISOString() : null;
  const scopes = input.scopes ?? null;
  await sql()`
    insert into oauth_tokens (user_id, provider, access_token, refresh_token, expires_at, scopes)
    values (${input.userId}, 'google', ${input.accessToken ?? null}, ${input.refreshToken}, ${expiresIso}, ${scopes})
    on conflict (user_id, provider) do update set
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      scopes = excluded.scopes`;
}
