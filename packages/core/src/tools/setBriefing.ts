import { setBriefingHour } from "../db/briefingStore.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  hour?: unknown;
  enabled?: unknown;
}

export const setBriefing: AssistantTool = {
  name: "set_daily_briefing",
  description:
    "Turn the daily briefing (a morning summary of meetings, due tasks, and reminders) on or off, " +
    "and set the local hour it's sent. E.g. 'send me a daily summary at 8am' -> hour=8. " +
    "To turn it off, set enabled=false.",
  inputSchema: {
    type: "object",
    properties: {
      hour: {
        type: "number",
        description: "Local hour (0–23) to send the daily briefing, e.g. 8 for 8am.",
      },
      enabled: {
        type: "boolean",
        description: "Set false to disable the daily briefing. Defaults to true when an hour is given.",
      },
    },
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;

    if (input.enabled === false) {
      await setBriefingHour(ctx.user.id, null);
      return "Daily briefing turned off.";
    }

    const hour = Number(input.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return "Please give a valid hour between 0 and 23 (e.g. 8 for 8am).";
    }
    await setBriefingHour(ctx.user.id, hour);
    const display = hour === 0 ? "12am" : hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`;
    return `Daily briefing set for ${display} (${ctx.timezone}).`;
  },
};
