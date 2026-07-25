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
