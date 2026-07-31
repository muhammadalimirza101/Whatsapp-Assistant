// Personal-memory persistence + semantic search over pgvector.
import { and, desc, eq, sql as dsql } from "drizzle-orm";
import { db } from "./client.js";
import { memories } from "./schema.js";

/** Serialize a JS number[] into the pgvector text literal, e.g. "[0.1,0.2]". */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export async function insertMemory(input: {
  userId: string;
  content: string;
  embedding: number[];
  source?: string;
}): Promise<string> {
  const [row] = await db
    .insert(memories)
    .values({
      userId: input.userId,
      content: input.content,
      embedding: input.embedding,
      source: input.source ?? "chat",
    })
    .returning({ id: memories.id });
  if (!row) throw new Error("Failed to insert memory.");
  return row.id;
}

export interface RecalledMemory {
  id: string;
  content: string;
  createdAt: Date;
  distance: number; // cosine distance (0 = identical)
}

/** Semantic search: nearest memories to the query embedding for this user. */
export async function searchMemories(
  userId: string,
  queryEmbedding: number[],
  limit = 5,
): Promise<RecalledMemory[]> {
  const literal = toVectorLiteral(queryEmbedding);
  // `<=>` is pgvector's cosine distance operator.
  const rows = await db
    .select({
      id: memories.id,
      content: memories.content,
      createdAt: memories.createdAt,
      distance: dsql<number>`${memories.embedding} <=> ${literal}::vector`,
    })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(dsql`${memories.embedding} <=> ${literal}::vector`)
    .limit(limit);
  return rows;
}

/** List a user's most recent memories (no vector search). */
export async function listMemories(userId: string, limit = 20) {
  return db
    .select({ id: memories.id, content: memories.content, createdAt: memories.createdAt })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.createdAt))
    .limit(limit);
}

/** Delete a memory by id (scoped to the user). Returns true if a row was removed. */
export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, userId)))
    .returning({ id: memories.id });
  return rows.length > 0;
}
