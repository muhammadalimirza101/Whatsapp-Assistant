import { embed } from "../clients/openai.js";
import { searchMemories, deleteMemory } from "../db/memoryStore.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  memory_id?: unknown;
  about?: unknown;
}

export const forget: AssistantTool = {
  name: "forget",
  description:
    "Delete a stored personal fact. Prefer memory_id (from list_memories). If you only have a " +
    "description of what to forget, pass `about` and the closest matching memory is removed. " +
    "Confirm with the user before forgetting if it's ambiguous.",
  inputSchema: {
    type: "object",
    properties: {
      memory_id: { type: "string", description: "The memory id (uuid) from list_memories." },
      about: { type: "string", description: "Fallback: a description of the fact to forget." },
    },
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;
    const id = typeof input.memory_id === "string" ? input.memory_id.trim() : "";

    if (id) {
      const ok = await deleteMemory(ctx.user.id, id);
      return ok ? "Done — I've forgotten that." : "I couldn't find that memory.";
    }

    const about = typeof input.about === "string" ? input.about.trim() : "";
    if (!about) return "Error: provide memory_id or a description of what to forget.";

    const hits = await searchMemories(ctx.user.id, await embed(about), 1);
    const top = hits[0];
    if (!top || top.distance > 0.6) return "I couldn't find a matching memory to forget.";
    await deleteMemory(ctx.user.id, top.id);
    return `Done — I've forgotten: "${top.content}".`;
  },
};
