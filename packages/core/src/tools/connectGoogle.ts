import { createOAuthState, hasGoogleConnected } from "../db/oauthStore.js";
import type { AssistantTool, UserContext } from "./types.js";

// Base URL of the Vercel OAuth app, e.g. https://your-app.vercel.app
function webBaseUrl(): string {
  const url = process.env.WEB_PUBLIC_URL;
  if (!url) throw new Error("WEB_PUBLIC_URL is not set (the Vercel app base URL).");
  return url.replace(/\/+$/, "");
}

export const connectGoogle: AssistantTool = {
  name: "connect_google",
  description:
    "Start linking the user's Google account (Calendar, Gmail, Sheets, Drive). " +
    "Use this when the user asks to connect Google, or when another Google tool reports they aren't connected. " +
    "Returns a link the user opens once to grant access.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  handler: async (_raw: unknown, ctx: UserContext): Promise<string> => {
    if (await hasGoogleConnected(ctx.user.id)) {
      return "Your Google account is already connected. You can ask me about your calendar, email, or sheets.";
    }
    const state = await createOAuthState(ctx.user.id);
    const link = `${webBaseUrl()}/api/auth/google?state=${state}`;
    return (
      "Tap this link to connect your Google account (it expires in 15 minutes):\n" +
      `${link}\n` +
      "After you approve access, come back here and continue."
    );
  },
};
