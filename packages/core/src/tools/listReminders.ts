import { and, asc, eq } from "drizzle-orm";
import { reminders } from "../db/schema.js";
import { formatInTz } from "../util/time.js";
import type { AssistantTool, UserContext } from "./types.js";

export const listReminders: AssistantTool = {
  name: "list_reminders",
  description:
    "List the user's upcoming (still scheduled) reminders, earliest first. " +
    "Use this when the user asks what reminders they have.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  handler: async (_raw: unknown, ctx: UserContext): Promise<string> => {
    const rows = await ctx.db
      .select({ id: reminders.id, text: reminders.text, fireAt: reminders.fireAt })
      .from(reminders)
      .where(and(eq(reminders.userId, ctx.user.id), eq(reminders.status, "scheduled")))
      .orderBy(asc(reminders.fireAt));

    if (rows.length === 0) return "You have no upcoming reminders.";

    const lines = rows.map(
      (r, i) => `${i + 1}. ${r.text} — ${formatInTz(r.fireAt, ctx.timezone)} [id:${r.id}]`,
    );
    return `Upcoming reminders:\n${lines.join("\n")}`;
  },
};
