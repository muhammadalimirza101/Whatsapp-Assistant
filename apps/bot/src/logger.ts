import pino from "pino";

// Single process logger. Baileys also accepts a pino instance (child) as its logger.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});
