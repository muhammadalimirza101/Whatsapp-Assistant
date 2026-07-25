// Tool registry contracts. Handlers return plain strings (or JSON strings) that
// go back to the model as tool results.
import type { Db } from "../db/client.js";
import type { User } from "../db/schema.js";

// Minimal JSON Schema shape we accept for tool inputs (OpenAI "parameters").
export interface JSONSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Scheduler abstraction used by reminder/followup tools. Implemented by the bot
 * with pg-boss (Step 5); kept as an interface so tools never import pg-boss.
 */
export interface Scheduler {
  /** Schedule a reminder to fire at `fireAt` (UTC). Returns the job id. */
  scheduleReminder(input: {
    reminderId: string;
    userId: string;
    fireAt: Date;
  }): Promise<string>;
  /** Cancel a previously scheduled reminder job. */
  cancelJob(jobId: string): Promise<void>;
  /** Schedule a follow-up to fire at `fireAt` (UTC). Returns the job id. */
  scheduleFollowup(input: {
    reminderId: string;
    userId: string;
    fireAt: Date;
  }): Promise<string>;
}

/** Everything a tool handler needs. Carried per-message. */
export interface UserContext {
  user: User;
  db: Db;
  scheduler: Scheduler;
  /** User's IANA timezone (e.g. "Asia/Karachi"), for formatting/parsing. */
  timezone: string;
}

export interface AssistantTool {
  name: string;
  description: string; // written for the model — be specific
  inputSchema: JSONSchema;
  handler: (input: unknown, ctx: UserContext) => Promise<string>;
}
