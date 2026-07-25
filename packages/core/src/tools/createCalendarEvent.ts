import { randomUUID } from "node:crypto";
import { google, getUserOAuthClient } from "../clients/google.js";
import { formatInTz, parseModelDate } from "../util/time.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  title?: unknown;
  start?: unknown;
  end?: unknown;
  attendees?: unknown;
  add_meet_link?: unknown;
  description?: unknown;
}

export const createCalendarEvent: AssistantTool = {
  name: "create_calendar_event",
  description:
    "Create a Google Calendar event. Compute `start` and `end` as ISO 8601 UTC timestamps from the " +
    "user's timezone. Optionally invite attendees (email addresses) and add a Google Meet link. " +
    "Requires Google to be connected.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Event title." },
      start: { type: "string", description: "Start time, ISO 8601 UTC." },
      end: { type: "string", description: "End time, ISO 8601 UTC. If omitted, defaults to 1 hour after start." },
      attendees: {
        type: "array",
        items: { type: "string" },
        description: "Optional attendee email addresses to invite.",
      },
      add_meet_link: { type: "boolean", description: "Whether to add a Google Meet link. Default false." },
      description: { type: "string", description: "Optional event description/notes." },
    },
    required: ["title", "start"],
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;
    const auth = await getUserOAuthClient(ctx.user.id);
    if (!auth) return "Google isn't connected yet. Use connect_google to link it first.";

    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) return "Error: event title is required.";
    const start = typeof input.start === "string" ? parseModelDate(input.start) : null;
    if (!start) return "Error: start must be a valid ISO 8601 timestamp.";
    let end = typeof input.end === "string" ? parseModelDate(input.end) : null;
    if (!end) end = new Date(start.getTime() + 60 * 60 * 1000);

    const attendees = Array.isArray(input.attendees)
      ? input.attendees.filter((a): a is string => typeof a === "string").map((email) => ({ email }))
      : undefined;
    const addMeet = input.add_meet_link === true;

    const calendar = google.calendar({ version: "v3", auth });
    const { data } = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: addMeet ? 1 : 0,
      sendUpdates: attendees ? "all" : "none",
      requestBody: {
        summary: title,
        description: typeof input.description === "string" ? input.description : undefined,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees,
        conferenceData: addMeet
          ? { createRequest: { requestId: randomUUID() } }
          : undefined,
      },
    });

    const when = formatInTz(start, ctx.timezone);
    const meet = data.hangoutLink ? `\nMeet link: ${data.hangoutLink}` : "";
    const invited = attendees ? ` Invited ${attendees.length} guest(s).` : "";
    return `Event created: "${title}" at ${when}.${invited}${meet}`;
  },
};
