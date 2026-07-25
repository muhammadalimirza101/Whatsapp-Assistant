// Drizzle schema — mirrors the SQL in CLAUDE.md exactly.
// All timestamps are stored in UTC (timestamptz) and formatted per-user later.
import {
  bigint,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull().unique(), // E.164
  name: text("name"),
  timezone: text("timezone").notNull().default("Asia/Karachi"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").references(() => users.id),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  msgType: text("msg_type").default("text"), // text | audio | document | image
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reminders = pgTable("reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  text: text("text").notNull(),
  fireAt: timestamp("fire_at", { withTimezone: true }).notNull(),
  recurrence: text("recurrence"), // null | cron-like string
  jobId: text("job_id"), // pg-boss job id
  status: text("status").default("scheduled"), // scheduled | delivered | cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  title: text("title").notNull(),
  status: text("status").default("open"), // open | done
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    userId: uuid("user_id").references(() => users.id),
    provider: text("provider").notNull(), // 'google' (others later)
    accessToken: text("access_token"),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes").array(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.provider] }),
  }),
);

export const baileysAuth = pgTable(
  "baileys_auth",
  {
    sessionId: text("session_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sessionId, t.key] }),
  }),
);

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  storagePath: text("storage_path").notNull(), // Supabase Storage path
  filename: text("filename"),
  mimeType: text("mime_type"),
  extractedText: text("extracted_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Phase 2: short-lived state token tying a Google consent link to a user.
// Consumed once by the OAuth callback; rows are deleted after use / expiry.
export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(), // random token embedded in the consent URL
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  provider: text("provider").notNull().default("google"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Row types inferred from the schema, for use across the codebase.
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type OAuthToken = typeof oauthTokens.$inferSelect;
export type BaileysAuthRow = typeof baileysAuth.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type OAuthState = typeof oauthStates.$inferSelect;
