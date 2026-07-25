import { google, getUserOAuthClient } from "../clients/google.js";
import type { AssistantTool, UserContext } from "./types.js";
import { buildRawEmail } from "./emailUtil.js";

interface Input {
  to?: unknown;
  subject?: unknown;
  body?: unknown;
}

export const draftEmail: AssistantTool = {
  name: "draft_email",
  description:
    "Create a Gmail draft (does NOT send). Use this to prepare an email and show the user a preview " +
    "before sending. Always draft first when the user wants to email someone. Requires Google connected.",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email address." },
      subject: { type: "string", description: "Email subject." },
      body: { type: "string", description: "Email body (plain text)." },
    },
    required: ["to", "subject", "body"],
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;
    const auth = await getUserOAuthClient(ctx.user.id);
    if (!auth) return "Google isn't connected yet. Use connect_google to link it first.";

    const to = typeof input.to === "string" ? input.to.trim() : "";
    const subject = typeof input.subject === "string" ? input.subject : "";
    const body = typeof input.body === "string" ? input.body : "";
    if (!to || !subject || !body) return "Error: to, subject, and body are all required.";

    const gmail = google.gmail({ version: "v1", auth });
    const raw64 = buildRawEmail(to, subject, body);
    const { data } = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw: raw64 } },
    });

    return (
      `Draft ready (id: ${data.id}). Preview:\n` +
      `To: ${to}\nSubject: ${subject}\n\n${body}\n\n` +
      "Reply 'send it' to send, or tell me what to change."
    );
  },
};
