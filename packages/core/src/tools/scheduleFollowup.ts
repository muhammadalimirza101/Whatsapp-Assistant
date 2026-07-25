import { eq } from "drizzle-orm";
import { reminders } from "../db/schema.js";
import { formatInTz, parseModelDate } from "../util/time.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  with_whom?: unknown;
  note?: unknown;
  fire_at?: unknown;
}

export const scheduleFollowup: AssistantTool = {
  name: "schedule_followup",
  description:
    "Schedule a follow-up nudge, e.g. 'follow up with Ahmed after 3 days'. " +
    "Compute `fire_at` as an ISO 8601 UTC timestamp from the current time and the user's timezone. " +
    "The assistant will message the user at that time to follow up.",
  inputSchema: {
    type: "object",
    properties: {
      with_whom: {
        type: "string",
        description: "Who / what to follow up with, e.g. 'Ahmed' or 'the supplier'.",
      },
      note: {
        type: "string",
        description: "Optional extra context about the follow-up.",
      },
      fire_at: {
        type: "string",
        description: "ISO 8601 UTC timestamp when the follow-up should fire.",
      },
    },
    required: ["with_whom", "fire_at"],
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;
    const withWhom = typeof input.with_whom === "string" ? input.with_whom.trim() : "";
    const note = typeof input.note === "string" ? input.note.trim() : "";
    const fireAtStr = typeof input.fire_at === "string" ? input.fire_at : "";

    if (!withWhom) return "Error: who to follow up with is required.";
    const fireAt = parseModelDate(fireAtStr);
    if (!fireAt) return "Error: fire_at must be a valid ISO 8601 timestamp.";
    if (fireAt.getTime() <= Date.now()) {
      return "Error: fire_at is in the past. Ask the user for a future time.";
    }

    const text = note
      ? `Follow up with ${withWhom}: ${note}`
      : `Follow up with ${withWhom}.`;

    const [row] = await ctx.db
      .insert(reminders)
      .values({ userId: ctx.user.id, text, fireAt })
      .returning({ id: reminders.id });
    if (!row) return "Error: failed to save follow-up.";

    const jobId = await ctx.scheduler.scheduleFollowup({
      reminderId: row.id,
      userId: ctx.user.id,
      fireAt,
    });
    await ctx.db.update(reminders).set({ jobId }).where(eq(reminders.id, row.id));

    return `Follow-up set: ${text} — ${formatInTz(fireAt, ctx.timezone)}.`;
  },
};
