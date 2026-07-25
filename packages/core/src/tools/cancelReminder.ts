import { and, asc, eq } from "drizzle-orm";
import { reminders } from "../db/schema.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  reminder_id?: unknown;
}

export const cancelReminder: AssistantTool = {
  name: "cancel_reminder",
  description:
    "Cancel a scheduled reminder by its id. If you don't know the id, call list_reminders first " +
    "to find it. This both removes the scheduled job and marks the reminder cancelled.",
  inputSchema: {
    type: "object",
    properties: {
      reminder_id: {
        type: "string",
        description: "The reminder id (uuid), as shown by list_reminders.",
      },
    },
    required: ["reminder_id"],
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;
    const id = typeof input.reminder_id === "string" ? input.reminder_id.trim() : "";
    if (!id) return "Error: reminder_id is required. Call list_reminders to find it.";

    const [row] = await ctx.db
      .select({ id: reminders.id, text: reminders.text, jobId: reminders.jobId, status: reminders.status })
      .from(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.userId, ctx.user.id)))
      .orderBy(asc(reminders.fireAt))
      .limit(1);

    if (!row) return "No reminder found with that id.";
    if (row.status !== "scheduled") return `That reminder is already ${row.status}.`;

    if (row.jobId) {
      try {
        await ctx.scheduler.cancelJob(row.jobId);
      } catch {
        // Job may have already fired/expired; cancelling the row is still correct.
      }
    }
    await ctx.db.update(reminders).set({ status: "cancelled" }).where(eq(reminders.id, id));
    return `Cancelled reminder: "${row.text}".`;
  },
};
