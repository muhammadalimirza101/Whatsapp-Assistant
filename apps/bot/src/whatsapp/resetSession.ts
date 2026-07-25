// Reset the Baileys session: deletes all baileys_auth rows for the session id,
// forcing a fresh QR pairing on the next boot. Use this after the device is
// unlinked from WhatsApp (logged out), which leaves stale credentials behind.
//
// Run: pnpm --filter @wa/bot reset-session
import { sql } from "@wa/core";

async function main(): Promise<void> {
  const session = process.env.BAILEYS_SESSION_ID ?? "default";
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n from baileys_auth where session_id = ${session}`;
  const before = rows[0]?.n ?? 0;
  await sql`delete from baileys_auth where session_id = ${session}`;
  console.log(
    `Cleared ${before} baileys_auth row(s) for session '${session}'. ` +
      "Next boot will print a fresh QR.",
  );
  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("reset-session failed:", e);
  process.exit(1);
});
