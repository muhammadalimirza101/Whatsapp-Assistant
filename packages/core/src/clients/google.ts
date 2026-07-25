// Google OAuth + API client. Builds an OAuth2 client that auto-refreshes the
// access token from the stored refresh token, and persists refreshed tokens
// back to oauth_tokens. Shared by the bot's Google tools and the Vercel callback.
import { google } from "googleapis";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { oauthTokens } from "../db/schema.js";

// The Google scopes Phase 2 requests. Calendar (read/write), Gmail send + read,
// Drive readonly, Sheets readonly.
// Derive the OAuth2 client + credentials types from googleapis itself (avoids a
// direct dependency on google-auth-library, which is only transitively installed).
export type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
type GoogleCredentials = Parameters<OAuth2Client["setCredentials"]>[0];

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

function googleEnv(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth env not fully set (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI).",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** A bare OAuth2 client (no tokens) — used to build consent URLs and exchange codes. */
export function makeOAuthClient(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = googleEnv();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** Build the Google consent URL for a given state token. */
export function buildConsentUrl(state: string): string {
  const client = makeOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh token every time
    scope: GOOGLE_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

/**
 * Build an authenticated OAuth2 client for a user, loading their stored tokens.
 * The client auto-refreshes the access token; refreshed tokens are written back.
 * Returns null if the user hasn't connected Google.
 */
export async function getUserOAuthClient(userId: string): Promise<OAuth2Client | null> {
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, "google")))
    .limit(1);
  if (!row?.refreshToken) return null;

  const client = makeOAuthClient();
  client.setCredentials({
    access_token: row.accessToken ?? undefined,
    refresh_token: row.refreshToken,
    expiry_date: row.expiresAt ? row.expiresAt.getTime() : undefined,
  });

  // Persist refreshed access tokens back to the DB.
  client.on("tokens", (tokens: GoogleCredentials) => {
    void (async () => {
      const set: Partial<typeof oauthTokens.$inferInsert> = {};
      if (tokens.access_token) set.accessToken = tokens.access_token;
      if (tokens.expiry_date) set.expiresAt = new Date(tokens.expiry_date);
      if (tokens.refresh_token) set.refreshToken = tokens.refresh_token;
      if (Object.keys(set).length === 0) return;
      await db
        .update(oauthTokens)
        .set(set)
        .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, "google")));
    })();
  });

  return client;
}

export { google };
