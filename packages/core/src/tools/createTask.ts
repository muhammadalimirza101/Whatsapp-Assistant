import { tasks } from "../db/schema.js";
import { formatInTz, parseModelDate } from "../util/time.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  title?: unknown;
  due_at?: unknown;
}

export const createTask: AssistantTool = {
  name: "create_task",
  description:
    "Add a task / to-do item for the user. Use this for things the user wants to remember to do " +
    "(e.g. 'add order fabric to my to-do list'). Optionally set a due date as an ISO 8601 UTC timestamp.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "The task description." },
      due_at: {
        type: "string",
        description: "Optional ISO 8601 UTC due timestamp, e.g. 2026-07-25T09:00:00Z.",
      },
    },
    required: ["title"],
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) return "Error: task title is required.";

    let dueAt: Date | null = null;
    if (typeof input.due_at === "string" && input.due_at.trim()) {
      dueAt = parseModelDate(input.due_at);
      if (!dueAt) return "Error: due_at must be a valid ISO 8601 timestamp.";
    }

    await ctx.db.insert(tasks).values({ userId: ctx.user.id, title, dueAt });
    const suffix = dueAt ? ` (due ${formatInTz(dueAt, ctx.timezone)})` : "";
    return `Added to your to-do list: "${title}"${suffix}.`;
  },
};
