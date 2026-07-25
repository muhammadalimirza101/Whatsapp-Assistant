// GET /api/auth/google?state=... — redirect the user to Google's consent screen.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildConsentUrl, consumeOAuthState, createOAuthState } from "../../lib/oauth.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!state) {
    res.status(400).send("Missing state parameter.");
    return;
  }

  const userId = await consumeOAuthState(state);
  if (!userId) {
    res
      .status(400)
      .send("This link has expired or is invalid. Send 'connect google' on WhatsApp again.");
    return;
  }

  const freshState = await createOAuthState(userId);
  res.redirect(302, buildConsentUrl(freshState));
}
