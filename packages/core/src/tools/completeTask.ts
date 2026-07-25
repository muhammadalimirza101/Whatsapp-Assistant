import { and, eq, ilike } from "drizzle-orm";
import { tasks } from "../db/schema.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  task_id?: unknown;
  title?: unknown;
}

export const completeTask: AssistantTool = {
  name: "complete_task",
  description:
    "Mark a task as done. Prefer identifying it by task_id (from list_tasks). " +
    "If the user refers to it by name and you don't have the id, pass `title` and the closest open task will be matched.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "The task id (uuid), as shown by list_tasks." },
      title: {
        type: "string",
        description: "Fallback: (part of) the task title, if the id is unknown.",
      },
    },
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;
    const id = typeof input.task_id === "string" ? input.task_id.trim() : "";
    const title = typeof input.title === "string" ? input.title.trim() : "";

    if (!id && !title) return "Error: provide task_id or title to identify the task.";

    const match = id
      ? and(eq(tasks.id, id), eq(tasks.userId, ctx.user.id))
      : and(
          eq(tasks.userId, ctx.user.id),
          eq(tasks.status, "open"),
          ilike(tasks.title, `%${title}%`),
        );

    const [row] = await ctx.db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status })
      .from(tasks)
      .where(match)
      .limit(1);

    if (!row) return "No matching task found.";
    if (row.status === "done") return `"${row.title}" is already done.`;

    await ctx.db.update(tasks).set({ status: "done" }).where(eq(tasks.id, row.id));
    return `Marked done: "${row.title}".`;
  },
};
