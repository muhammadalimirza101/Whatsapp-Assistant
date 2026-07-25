import { google, getUserOAuthClient } from "../clients/google.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  max?: unknown;
  query?: unknown;
}

function header(headers: { name?: string | null; value?: string | null }[] | undefined, name: string): string {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

export const readRecentEmails: AssistantTool = {
  name: "read_recent_emails",
  description:
    "Read the user's most recent Gmail messages (subject, sender, snippet). Optionally filter with a " +
    "Gmail search query (e.g. 'is:unread', 'from:boss@x.com'). Requires Google connected.",
  inputSchema: {
    type: "object",
    properties: {
      max: { type: "number", description: "How many emails to fetch (1–10). Default 5." },
      query: { type: "string", description: "Optional Gmail search query." },
    },
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;
    const auth = await getUserOAuthClient(ctx.user.id);
    if (!auth) return "Google isn't connected yet. Use connect_google to link it first.";

    const max = Math.min(Math.max(Number(input.max) || 5, 1), 10);
    const query = typeof input.query === "string" ? input.query : undefined;

    const gmail = google.gmail({ version: "v1", auth });
    const list = await gmail.users.messages.list({ userId: "me", maxResults: max, q: query });
    const ids = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id);
    if (ids.length === 0) return query ? "No emails match that search." : "No recent emails found.";

    const items = await Promise.all(
      ids.map(async (id) => {
        const { data } = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        const from = header(data.payload?.headers ?? undefined, "From");
        const subject = header(data.payload?.headers ?? undefined, "Subject");
        const snippet = data.snippet ?? "";
        return `• ${subject || "(no subject)"}\n  from ${from}\n  ${snippet}`;
      }),
    );
    return `Recent emails:\n${items.join("\n\n")}`;
  },
};
