// GET /api/auth/google?state=... — redirect the user to Google's consent screen.
// The state token was created by the connect_google tool and ties this flow to
// a specific user. We validate it exists before redirecting.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildConsentUrl, consumeOAuthState, createOAuthState } from "@wa/core";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!state) {
    res.status(400).send("Missing state parameter.");
    return;
  }

  // Validate the state maps to a user, but DON'T consume it yet — the callback
  // needs it. We re-issue a fresh state bound to the same user so the token is
  // still single-use at the callback step.
  const userId = await consumeOAuthState(state);
  if (!userId) {
    res
      .status(400)
      .send("This link has expired or is invalid. Send 'connect google' on WhatsApp again.");
    return;
  }

  const freshState = await createOAuthState(userId);
  const url = buildConsentUrl(freshState);
  res.redirect(302, url);
}
