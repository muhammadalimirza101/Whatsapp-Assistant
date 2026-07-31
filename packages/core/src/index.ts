// @wa/core — shared code for the WhatsApp assistant.
export const CORE_VERSION = "0.1.0";

export { db, sql, schema } from "./db/client.js";
export type { Db } from "./db/client.js";
export * from "./db/schema.js";

export type {
  WhatsAppAdapter,
  NormalizedMessage,
  MessageHandler,
} from "./whatsapp/adapter.js";
export { toIdentity, toE164, parseAllowlist, isAllowed } from "./whatsapp/phone.js";
export {
  getAuthBlob,
  setAuthBlob,
  deleteAuthBlobs,
} from "./whatsapp/authStore.js";
export {
  getReminderForDelivery,
  markReminderDelivered,
  rescheduleRecurringReminder,
} from "./db/reminderStore.js";
export type { DeliverableReminder } from "./db/reminderStore.js";
export {
  getOrCreateUser,
  logMessage,
  loadHistory,
} from "./db/userStore.js";

// Tools + agent loop
export {
  listTools,
  getTool,
  runTool,
  openAiToolDefs,
} from "./tools/index.js";
export type {
  AssistantTool,
  UserContext,
  Scheduler,
  JSONSchema,
} from "./tools/types.js";
export { runAgent } from "./agent/loop.js";
export type { HistoryTurn, AgentLogger } from "./agent/loop.js";
export { buildSystemPrompt } from "./agent/prompt.js";
export { formatInTz, nowInTz, parseModelDate } from "./util/time.js";

// Clients
export { openai, OPENAI_MODEL, embed, EMBEDDING_MODEL } from "./clients/openai.js";
export {
  insertMemory,
  searchMemories,
  listMemories,
  deleteMemory,
} from "./db/memoryStore.js";
export { transcribeAudio, GROQ_MODEL } from "./clients/groq.js";
export {
  google,
  makeOAuthClient,
  buildConsentUrl,
  getUserOAuthClient,
  GOOGLE_SCOPES,
} from "./clients/google.js";

// OAuth store (Phase 2)
export {
  createOAuthState,
  consumeOAuthState,
  upsertGoogleTokens,
  hasGoogleConnected,
} from "./db/oauthStore.js";
