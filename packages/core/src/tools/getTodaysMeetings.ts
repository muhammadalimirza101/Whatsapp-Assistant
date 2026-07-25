import { google, getUserOAuthClient } from "../clients/google.js";
import { formatInTz } from "../util/time.js";
import type { AssistantTool, UserContext } from "./types.js";

export const getTodaysMeetings: AssistantTool = {
  name: "get_todays_meetings",
  description:
    "List the user's Google Calendar events for today (their timezone). " +
    "Requires the user to have connected Google; if not, tell them to run connect_google.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  handler: async (_raw: unknown, ctx: UserContext): Promise<string> => {
    const auth = await getUserOAuthClient(ctx.user.id);
    if (!auth) return "Google isn't connected yet. Use connect_google to link it first.";

    // Compute today's start/end in the user's timezone as UTC instants.
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: ctx.timezone,
      year: "numeric",
      month: "2-digit",
      day: "numeric",
    });
    const ymd = fmt.format(now); // e.g. 2026-07-25
    const timeMin = new Date(`${ymd}T00:00:00`);
    const timeMax = new Date(`${ymd}T23:59:59`);

    const calendar = google.calendar({ version: "v3", auth });
    const { data } = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = data.items ?? [];
    if (events.length === 0) return "You have no meetings on your calendar today.";

    const lines = events.map((e) => {
      const start = e.start?.dateTime
        ? formatInTz(new Date(e.start.dateTime), ctx.timezone)
        : "All day";
      return `• ${e.summary ?? "(no title)"} — ${start}`;
    });
    return `Today's meetings:\n${lines.join("\n")}`;
  },
};
