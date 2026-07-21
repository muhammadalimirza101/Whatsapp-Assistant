# @wa/web (Vercel) — Phase 2 placeholder

This app is intentionally empty in **Phase 1**.

In **Phase 2** it becomes the Vercel serverless app hosting the Google OAuth
routes described in the spec:

- `GET /api/auth/google` — redirect to Google consent (Calendar, Gmail, Drive readonly, Sheets readonly; `access_type=offline`, `prompt=consent`)
- `GET /api/auth/google/callback` — exchange code, upsert `oauth_tokens`, show "Done, go back to WhatsApp"

No scheduled/reminder logic ever runs here (Vercel Hobby cron is once/day). All
time-based jobs live in pg-boss inside the Render bot process.
