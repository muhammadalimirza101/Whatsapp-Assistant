import { eq } from "drizzle-orm";
import { reminders } from "../db/schema.js";
import { formatInTz, parseModelDate } from "../util/time.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  text?: unknown;
  fire_at?: unknown;
  recurrence?: unknown;
}

export const createReminder: AssistantTool = {
  name: "create_reminder",
  description:
    "Create a one-off or recurring reminder that the assistant will send to the user at a specific time. " +
    "Compute `fire_at` as an ISO 8601 UTC timestamp based on the current time and the user's timezone given in the system prompt. " +
    "Use `recurrence` only for repeating reminders, as a cron expression (e.g. '0 9 * * *' for daily 9am); omit it for one-off reminders.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "What to remind the user about." },
      fire_at: {
        type: "string",
        description: "ISO 8601 UTC timestamp when the reminder should fire, e.g. 2026-07-24T11:00:00Z.",
      },
      recurrence: {
        type: "string",
        description: "Optional cron expression for a recurring reminder. Omit for one-off.",
      },
    },
    required: ["text", "fire_at"],
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;
    const text = typeof input.text === "string" ? input.text.trim() : "";
    const fireAtStr = typeof input.fire_at === "string" ? input.fire_at : "";
    const recurrence =
      typeof input.recurrence === "string" && input.recurrence.trim()
        ? input.recurrence.trim()
        : null;

    if (!text) return "Error: reminder text is required.";
    const fireAt = parseModelDate(fireAtStr);
    if (!fireAt) return "Error: fire_at must be a valid ISO 8601 timestamp.";
    if (fireAt.getTime() <= Date.now()) {
      return "Error: fire_at is in the past. Ask the user for a future time.";
    }

    // Write the row first, then schedule the pg-boss job, then store its id.
    const [row] = await ctx.db
      .insert(reminders)
      .values({ userId: ctx.user.id, text, fireAt, recurrence })
      .returning({ id: reminders.id });
    if (!row) return "Error: failed to save reminder.";

    const jobId = await ctx.scheduler.scheduleReminder({
      reminderId: row.id,
      userId: ctx.user.id,
      fireAt,
    });
    await ctx.db
      .update(reminders)
      .set({ jobId })
      .where(eq(reminders.id, row.id));

    const when = formatInTz(fireAt, ctx.timezone);
    return recurrence
      ? `Recurring reminder set: "${text}" starting ${when} (${recurrence}).`
      : `Reminder set: "${text}" at ${when}.`;
  },
};
