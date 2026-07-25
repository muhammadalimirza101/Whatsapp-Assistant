import { google, getUserOAuthClient } from "../clients/google.js";
import { buildRawEmail } from "./emailUtil.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  to?: unknown;
  subject?: unknown;
  body?: unknown;
  confirmed?: unknown;
}

export const sendEmail: AssistantTool = {
  name: "send_email",
  description:
    "Send an email via Gmail. IMPORTANT: this is an outbound action. You MUST first show the user the " +
    "exact recipient, subject, and body (use draft_email or state them in chat) and get an explicit " +
    "confirmation like 'yes send it'. Only then call this with confirmed=true. Never send without the " +
    "user's clear go-ahead. Requires Google connected.",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email address." },
      subject: { type: "string", description: "Email subject." },
      body: { type: "string", description: "Email body (plain text)." },
      confirmed: {
        type: "boolean",
        description: "Must be true, set only after the user explicitly confirmed sending in chat.",
      },
    },
    required: ["to", "subject", "body", "confirmed"],
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;

    if (input.confirmed !== true) {
      return "Not sent: I need explicit confirmation first. Show the user the draft and ask them to confirm.";
    }

    const auth = await getUserOAuthClient(ctx.user.id);
    if (!auth) return "Google isn't connected yet. Use connect_google to link it first.";

    const to = typeof input.to === "string" ? input.to.trim() : "";
    const subject = typeof input.subject === "string" ? input.subject : "";
    const body = typeof input.body === "string" ? input.body : "";
    if (!to || !subject || !body) return "Error: to, subject, and body are all required.";

    const gmail = google.gmail({ version: "v1", auth });
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: buildRawEmail(to, subject, body) },
    });

    return `Email sent to ${to} (subject: "${subject}").`;
  },
};
