import { listMemories as loadMemories } from "../db/memoryStore.js";
import type { AssistantTool, UserContext } from "./types.js";

export const listMemoriesTool: AssistantTool = {
  name: "list_memories",
  description:
    "List everything you've stored about the user (their remembered facts), most recent first. " +
    "Use when the user asks what you know or remember about them.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  handler: async (_raw: unknown, ctx: UserContext): Promise<string> => {
    const rows = await loadMemories(ctx.user.id, 20);
    if (rows.length === 0) return "I haven't stored anything about you yet.";
    const lines = rows.map((r, i) => `${i + 1}. ${r.content} [id:${r.id}]`);
    return `Here's what I remember about you:\n${lines.join("\n")}`;
  },
};
