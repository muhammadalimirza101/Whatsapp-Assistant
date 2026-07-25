// OAuth state + token persistence, shared by the connect_google tool and the
// Vercel OAuth callback.
import { randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "./client.js";
import { oauthStates, oauthTokens } from "./schema.js";

const STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Create a one-time state token for a user's Google consent link. */
export async function createOAuthState(userId: string): Promise<string> {
  const state = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  await db.insert(oauthStates).values({ state, userId, provider: "google", expiresAt });
  return state;
}

/**
 * Consume a state token: returns its userId if valid and unexpired, else null.
 * The row is deleted whether or not it was valid (single use).
 */
export async function consumeOAuthState(state: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(oauthStates)
    .where(eq(oauthStates.state, state))
    .limit(1);
  // Always delete the row (single-use), plus opportunistically clear expired ones.
  await db.delete(oauthStates).where(eq(oauthStates.state, state));
  await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));

  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row.userId;
}

/** Upsert Google tokens for a user (called by the OAuth callback). */
export async function upsertGoogleTokens(input: {
  userId: string;
  accessToken?: string | null;
  refreshToken: string;
  expiresAt?: Date | null;
  scopes?: string[];
}): Promise<void> {
  await db
    .insert(oauthTokens)
    .values({
      userId: input.userId,
      provider: "google",
      accessToken: input.accessToken ?? null,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt ?? null,
      scopes: input.scopes,
    })
    .onConflictDoUpdate({
      target: [oauthTokens.userId, oauthTokens.provider],
      set: {
        accessToken: input.accessToken ?? null,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt ?? null,
        scopes: input.scopes,
      },
    });
}

/** True if the user has connected Google (has a refresh token). */
export async function hasGoogleConnected(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: oauthTokens.userId })
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, "google")))
    .limit(1);
  return Boolean(row);
}
