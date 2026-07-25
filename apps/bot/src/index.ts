// @wa/bot entrypoint. Boots the health server, the Baileys WhatsApp adapter,
// and the pg-boss scheduler, then wires the message handler.
import { sql } from "@wa/core";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { startHealthServer } from "./health.js";
import { BaileysAdapter } from "./whatsapp/baileysAdapter.js";
import { PgBossScheduler } from "./scheduler/pgBossScheduler.js";
import { makeMessageHandler } from "./handler.js";

async function main(): Promise<void> {
  const config = loadConfig();
  logger.info(
    { session: config.sessionId, allowlisted: config.allowlist.size },
    "Starting WhatsApp assistant bot",
  );

  // WhatsApp adapter (Baileys).
  const adapter = new BaileysAdapter(config.sessionId);

  // Health endpoint — must be up first so Render's health check / keep-alive
  // ping succeeds even while WhatsApp is still pairing. Reports the adapter's
  // real socket state.
  const healthServer = startHealthServer(config.port, {
    whatsappConnected: () => adapter.isConnected(),
  });

  // Scheduler (pg-boss) — needs the adapter to deliver reminders.
  const scheduler = new PgBossScheduler(config.databaseUrl, adapter);
  await scheduler.start();

  // Wire the message handler and connect WhatsApp.
  adapter.onMessage(
    makeMessageHandler({ adapter, scheduler, allowlist: config.allowlist }),
  );
  await adapter.connect();

  // Graceful shutdown.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down");
    try {
      healthServer.close();
      await scheduler.stop();
      await adapter.close();
      await sql.end();
    } catch (err) {
      logger.error(err, "Error during shutdown");
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  logger.info("Bot is up. Waiting for messages.");
}

main().catch((err) => {
  logger.error(err, "Fatal error during startup");
  process.exit(1);
});
