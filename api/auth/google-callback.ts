// GET /api/auth/google/callback?code=...&state=... — exchange the auth code for
// tokens, upsert them for the user, and show a "Done, go back to WhatsApp" page.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { makeOAuthClient, consumeOAuthState, upsertGoogleTokens } from "../../lib/oauth.js";

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;text-align:center;color:#111}h1{font-size:1.4rem}p{color:#444;line-height:1.5}</style></head><body><h1>${title}</h1><p>${body}</p></body></html>`;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const error = typeof req.query.error === "string" ? req.query.error : "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (error) {
    res.status(400).send(page("Couldn't connect", `Google returned: ${error}. You can try again from WhatsApp.`));
    return;
  }
  if (!code || !state) {
    res.status(400).send(page("Couldn't connect", "Missing code or state. Please retry from WhatsApp."));
    return;
  }

  const userId = await consumeOAuthState(state);
  if (!userId) {
    res.status(400).send(page("Link expired", "This link expired. Send 'connect google' on WhatsApp again."));
    return;
  }

  try {
    const client = makeOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      res
        .status(400)
        .send(
          page(
            "Almost there",
            "Google didn't return a refresh token. Please try again and make sure to grant access.",
          ),
        );
      return;
    }

    await upsertGoogleTokens({
      userId,
      accessToken: tokens.access_token ?? null,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scopes: tokens.scope ? tokens.scope.split(" ") : undefined,
    });

    res
      .status(200)
      .send(page("You're connected ✅", "Google is now linked. Go back to WhatsApp and continue."));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    res.status(500).send(page("Something went wrong", `Couldn't complete sign-in (${msg}). Try again from WhatsApp.`));
  }
}
