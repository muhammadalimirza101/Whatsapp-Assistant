import { embed } from "../clients/openai.js";
import { searchMemories } from "../db/memoryStore.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  query?: unknown;
}

// Cosine distance above this is treated as "not relevant" (0 = identical match).
// text-embedding-3-small distances for genuinely related facts commonly land in
// the 0.4–0.65 range, so keep the cutoff generous to avoid dropping valid recalls.
const RELEVANCE_CUTOFF = 0.72;

export const recall: AssistantTool = {
  name: "recall",
  description:
    "Look up personal facts you previously stored about the user, using semantic search. " +
    "Use this whenever answering needs something the user told you earlier " +
    "(e.g. 'when is my wife's birthday?', 'what am I allergic to?', 'what did I say about the project?'). " +
    "Pass the user's question or the topic as the query.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "What to look up, e.g. 'wife's birthday' or 'allergies'.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const rawQuery = (raw as Input).query;
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
    if (!query) return "Error: no query provided.";

    const queryEmbedding = await embed(query);
    const hits = await searchMemories(ctx.user.id, queryEmbedding, 5);
    const relevant = hits.filter((h) => h.distance <= RELEVANCE_CUTOFF);

    if (relevant.length === 0) {
      return "I don't have anything stored about that.";
    }
    const lines = relevant.map((h) => `• ${h.content}`);
    return `Here's what I remember:\n${lines.join("\n")}`;
  },
};
