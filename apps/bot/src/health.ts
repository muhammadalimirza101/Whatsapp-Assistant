// Minimal Express server exposing GET /health. The keep-alive pinger
// (cron-job.org / UptimeRobot) hits this every ~10 min to prevent Render's
// free tier from sleeping. Must exist from the first deploy.
import express from "express";
import type { Server } from "node:http";
import { logger } from "./logger.js";

export interface HealthState {
  whatsappConnected: () => boolean;
}

export function startHealthServer(port: number, state: HealthState): Server {
  const app = express();

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      whatsapp: state.whatsappConnected() ? "connected" : "connecting",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/", (_req, res) => {
    res.status(200).send("WhatsApp assistant bot is running.");
  });

  const server = app.listen(port, () => {
    logger.info(`Health server listening on :${port} (GET /health)`);
  });
  return server;
}
