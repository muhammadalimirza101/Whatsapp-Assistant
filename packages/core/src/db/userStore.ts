// User + message persistence helpers used by the bot's message handler.
import { and, desc, eq } from "drizzle-orm";
import { db } from "./client.js";
import { messages, users, type User } from "./schema.js";
import type { HistoryTurn } from "../agent/loop.js";

/** Find a user by phone, or create one. Phone is E.164. */
export async function getOrCreateUser(
  phone: string,
  defaults?: { name?: string; timezone?: string },
): Promise<User> {
  const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      phone,
      name: defaults?.name,
      // let the column default (Asia/Karachi) apply when not provided
      ...(defaults?.timezone ? { timezone: defaults.timezone } : {}),
    })
    .returning();
  if (!created) throw new Error(`Failed to create user for ${phone}`);
  return created;
}

/** Persist one message turn. */
export async function logMessage(
  userId: string,
  role: "user" | "assistant",
  content: string,
  msgType: "text" | "audio" | "document" | "image" = "text",
): Promise<void> {
  await db.insert(messages).values({ userId, role, content, msgType });
}

/**
 * Load the last `limit` conversation turns for a user (oldest first), for the
 * agent's context window. Defaults to 20 per the spec.
 */
export async function loadHistory(userId: string, limit = 20): Promise<HistoryTurn[]> {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(desc(messages.id))
    .limit(limit);

  // rows are newest-first; reverse to oldest-first and coerce role.
  return rows
    .reverse()
    .filter((r): r is { role: string; content: string } => r.content != null)
    .map((r) => ({
      role: r.role === "assistant" ? "assistant" : "user",
      content: r.content,
    }));
}
