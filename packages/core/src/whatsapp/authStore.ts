// Persistence primitives for Baileys auth blobs, kept in core so apps/bot never
// imports drizzle-orm directly. The Baileys-specific serialization lives in the
// bot's auth-state provider; this module only reads/writes opaque jsonb values.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { baileysAuth } from "../db/schema.js";

export async function getAuthBlob(
  sessionId: string,
  key: string,
): Promise<unknown | undefined> {
  const rows = await db
    .select({ value: baileysAuth.value })
    .from(baileysAuth)
    .where(and(eq(baileysAuth.sessionId, sessionId), eq(baileysAuth.key, key)))
    .limit(1);
  return rows[0]?.value;
}

export async function setAuthBlob(
  sessionId: string,
  key: string,
  value: object,
): Promise<void> {
  await db
    .insert(baileysAuth)
    .values({ sessionId, key, value })
    .onConflictDoUpdate({
      target: [baileysAuth.sessionId, baileysAuth.key],
      set: { value },
    });
}

export async function deleteAuthBlobs(
  sessionId: string,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  await db
    .delete(baileysAuth)
    .where(and(eq(baileysAuth.sessionId, sessionId), inArray(baileysAuth.key, keys)));
}
