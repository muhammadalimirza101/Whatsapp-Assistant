import { embed } from "../clients/openai.js";
import { insertMemory } from "../db/memoryStore.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  fact?: unknown;
}

export const remember: AssistantTool = {
  name: "remember",
  description:
    "Store a personal fact or piece of information the user wants you to remember long-term " +
    "(e.g. 'my wife's birthday is March 3', 'I'm allergic to peanuts', 'my car plate is ABC-123'). " +
    "Use this whenever the user says to remember, note, or save something about themselves or their life. " +
    "Write the fact as a clear standalone sentence.",
  inputSchema: {
    type: "object",
    properties: {
      fact: {
        type: "string",
        description: "The fact to remember, as a clear standalone sentence.",
      },
    },
    required: ["fact"],
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const rawFact = (raw as Input).fact;
    const fact = typeof rawFact === "string" ? rawFact.trim() : "";
    if (!fact) return "Error: nothing to remember was provided.";

    const embedding = await embed(fact);
    await insertMemory({ userId: ctx.user.id, content: fact, embedding });
    return `Got it — I'll remember that: "${fact}".`;
  },
};
