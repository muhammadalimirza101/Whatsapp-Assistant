import OpenAI from "openai";

let client: OpenAI | undefined;

/** Lazily-constructed shared OpenAI client. */
export function openai(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
    client = new OpenAI({ apiKey });
  }
  return client;
}

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ?? "text-embedding-3-small"; // 1536 dims

/** Embed a single piece of text into a 1536-dim vector. */
export async function embed(text: string): Promise<number[]> {
  const res = await openai().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  const vec = res.data[0]?.embedding;
  if (!vec) throw new Error("No embedding returned.");
  return vec;
}
