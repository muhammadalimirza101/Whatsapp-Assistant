// The message handler: implements the spec's message flow.
//  1. allowlist gate (silently ignore strangers)
//  2. ingest -> text (voice notes transcribed)
//  3. load/create user + last 20 turns
//  4. run the agent loop
//  5. send reply, log both sides
import {
  getOrCreateUser,
  loadHistory,
  logMessage,
  runAgent,
  isAllowed,
  type NormalizedMessage,
  type Scheduler,
  type UserContext,
  type WhatsAppAdapter,
} from "@wa/core";
import { db } from "@wa/core";
import { logger } from "./logger.js";
import { ingest } from "./ingest.js";

export interface HandlerDeps {
  adapter: WhatsAppAdapter;
  scheduler: Scheduler;
  allowlist: Set<string>;
}

export function makeMessageHandler(deps: HandlerDeps) {
  return async function handle(msg: NormalizedMessage): Promise<void> {
    // 1. Allowlist gate — ignore non-whitelisted numbers silently.
    if (!isAllowed(msg.from, deps.allowlist)) {
      logger.warn({ from: msg.from }, "Ignoring message from non-allowlisted number");
      return;
    }

    // 2. Ingest -> text (transcribe voice notes, etc.)
    const ingested = await ingest(msg);
    if (!ingested) {
      logger.info({ from: msg.from, type: msg.type }, "Nothing actionable in message");
      return;
    }

    try {
      // 3. Load/create user and recent history.
      const user = await getOrCreateUser(msg.from);
      const history = await loadHistory(user.id, 20);

      await logMessage(user.id, "user", ingested.text, ingested.msgType);

      // 4. Run the agent loop.
      const ctx: UserContext = {
        user,
        db,
        scheduler: deps.scheduler,
        timezone: user.timezone,
      };
      const reply = await runAgent(ingested.text, history, ctx, logger);

      // 5. Send reply, log assistant side.
      await deps.adapter.sendText(msg.from, reply);
      await logMessage(user.id, "assistant", reply, "text");
    } catch (err) {
      logger.error({ err, from: msg.from }, "Error handling message");
      try {
        await deps.adapter.sendText(
          msg.from,
          "Sorry, something went wrong on my end. Please try again.",
        );
      } catch {
        // best-effort; nothing more to do.
      }
    }
  };
}
