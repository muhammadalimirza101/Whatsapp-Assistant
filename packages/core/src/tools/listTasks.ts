import { and, asc, eq, sql } from "drizzle-orm";
import { tasks } from "../db/schema.js";
import { formatInTz } from "../util/time.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  include_done?: unknown;
}

export const listTasks: AssistantTool = {
  name: "list_tasks",
  description:
    "List the user's tasks / to-do items. By default shows only open tasks. " +
    "Set include_done=true to also show completed ones. Use when the user asks what's on their to-do list.",
  inputSchema: {
    type: "object",
    properties: {
      include_done: {
        type: "boolean",
        description: "Include completed tasks as well. Defaults to false.",
      },
    },
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const includeDone = (raw as Input)?.include_done === true;

    const whereClause = includeDone
      ? eq(tasks.userId, ctx.user.id)
      : and(eq(tasks.userId, ctx.user.id), eq(tasks.status, "open"));

    const rows = await ctx.db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status, dueAt: tasks.dueAt })
      .from(tasks)
      .where(whereClause)
      // open tasks first, then by due date (nulls last), then newest.
      .orderBy(asc(tasks.status), sql`${tasks.dueAt} asc nulls last`, asc(tasks.createdAt));

    if (rows.length === 0) {
      return includeDone ? "You have no tasks." : "Your to-do list is empty.";
    }

    const lines = rows.map((r, i) => {
      const mark = r.status === "done" ? "[done] " : "";
      const due = r.dueAt ? ` — due ${formatInTz(r.dueAt, ctx.timezone)}` : "";
      return `${i + 1}. ${mark}${r.title}${due} [id:${r.id}]`;
    });
    return `Your to-do list:\n${lines.join("\n")}`;
  },
};
