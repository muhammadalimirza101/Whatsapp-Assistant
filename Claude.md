# WhatsApp AI Personal Assistant — Project Specification

## What this project is

A WhatsApp bot that acts as an AI personal assistant. Users chat with it (text or voice notes) and it manages reminders, tasks, meetings, and follow-ups, and connects to external services (Google Calendar, Gmail, Sheets, Drive, CRM, accounting, project management tools) so the user can run their workday from a single WhatsApp conversation.

Current phase: testing build on Baileys (unofficial WhatsApp Web library). A later phase migrates to the official Meta WhatsApp Cloud API, so the WhatsApp layer must be built behind an adapter interface from day one.

## Deployment topology (all free tiers)

| Service | Role |
|---|---|
| **Render** (free web service, Node.js) | The persistent process: Baileys connection, AI agent loop, pg-boss reminder worker, Express server with `/health` endpoint |
| **Supabase** | Postgres database (with pgvector), file storage, Baileys auth state persistence, pg-boss job tables |
| **Vercel** | Serverless functions: Google OAuth callback routes, future Meta Cloud API webhook receiver |
| **cron-job.org or UptimeRobot** | Pings `GET /health` on the Render service every 10 minutes to prevent free-tier sleep (manual setup, not code) |

Important constraints these choices create:
- Render free tier sleeps after 15 min without HTTP traffic. The keep-alive ping prevents this. The `/health` endpoint must exist from the first deploy.
- Vercel Hobby cron runs at most once per day, so NO scheduled reminder logic goes on Vercel. All time-based jobs run in pg-boss inside the Render process.
- Render's filesystem is ephemeral. Nothing may be persisted to local disk: Baileys credentials go to Supabase tables, uploaded files go to Supabase Storage.

## Tech stack

- Node.js 20+, TypeScript, pnpm
- Monorepo with two apps: `apps/bot` (Render) and `apps/web` (Vercel), shared code in `packages/core`
- **Baileys** (`@whiskeysockets/baileys`) for WhatsApp
- **OpenAI API** (`gpt-4o-mini` for testing; upgrade to `gpt-4o` or `gpt-4.1` if tool selection quality demands it) with function/tool calling for the agent loop
- **pg-boss** for scheduled jobs (reminders, follow-ups) — runs on Postgres, no Redis needed
- **Drizzle ORM** for database access (session-mode connection via Supabase pooler, since the bot is long-running)
- **Groq API** (`whisper-large-v3`) for voice note transcription
- **googleapis** npm package for Calendar, Gmail, Sheets, Drive
- **ffmpeg** (via `fluent-ffmpeg` + static binary) for audio conversion if needed
- Express for the health endpoint and any local routes on the bot service

## Architecture

### Message flow

1. Baileys receives a message (text / voice note / document / image).
2. Ingestion normalizes it: voice notes are downloaded, converted if needed, transcribed via Groq Whisper; documents are downloaded to Supabase Storage and text-extracted; text passes through.
3. Load user record and the last N conversation turns from the `messages` table.
4. Run the agent loop: call the OpenAI chat completions API with the system prompt, conversation history, and the full tool catalog. Execute any tool calls the model makes, append the results as `tool` role messages, repeat until the model returns a final text response.
5. Send the reply through the WhatsApp adapter. Log both sides to `messages`.

### WhatsApp adapter interface

All WhatsApp interaction goes through this interface. Baileys is one implementation; the Meta Cloud API will be a second. Nothing outside the adapter may import Baileys directly.

```ts
interface WhatsAppAdapter {
  connect(): Promise<void>;
  sendText(to: string, text: string): Promise<void>;
  sendDocument(to: string, fileUrl: string, filename: string): Promise<void>;
  onMessage(handler: (msg: NormalizedMessage) => Promise<void>): void;
}

interface NormalizedMessage {
  from: string;            // E.164 phone number
  type: 'text' | 'audio' | 'document' | 'image';
  text?: string;
  mediaBuffer?: Buffer;
  mimeType?: string;
  filename?: string;
  timestamp: Date;
}
```

### Baileys auth state in Supabase

Do NOT use `useMultiFileAuthState`. Implement a custom auth state provider that reads/writes credential and key blobs to the `baileys_auth` table, so the session survives redeploys and restarts without rescanning the QR code. On first run, print the QR to logs (Render log stream) using `qrcode-terminal`.

### Agent loop and tool registry

Tools live in `packages/core/src/tools/`, one file per tool, each exporting:

```ts
interface AssistantTool {
  name: string;
  description: string;         // written for the model, be specific
  inputSchema: JSONSchema;
  handler: (input: unknown, ctx: UserContext) => Promise<string>;
}
```

A registry auto-loads every tool file and produces the `tools` array for the OpenAI API call (each tool wrapped as {type: "function", function: {name, description, parameters}}). `UserContext` carries the user row, their OAuth tokens, and helpers (db, storage). Handlers return plain strings (or JSON strings) that go back to the model as tool results.

The agent loop caps at 10 tool-use iterations per message and always ends by sending the model's final text to the user.

### Scheduler (pg-boss)

- Started inside the Render process at boot.
- `reminders` queue: a job scheduled for the reminder's fire time; the worker sends the reminder text via the WhatsApp adapter and marks the reminder row delivered.
- `followups` queue: same mechanism for "follow up with X after N days".
- Recurring reminders reschedule themselves on completion.
- Creating/cancelling a reminder always writes the `reminders` row AND the pg-boss job; the row stores the pg-boss job id for cancellation.

## Database schema (Supabase / Postgres)

Enable extension: `pgvector` (used in Phase 4).

```sql
users (
  id uuid pk default gen_random_uuid(),
  phone text unique not null,          -- E.164
  name text,
  timezone text default 'Asia/Karachi',
  created_at timestamptz default now()
)

messages (
  id bigint pk generated always as identity,
  user_id uuid references users(id),
  role text not null,                  -- 'user' | 'assistant'
  content text not null,
  msg_type text default 'text',        -- text | audio | document | image
  created_at timestamptz default now()
)

reminders (
  id uuid pk default gen_random_uuid(),
  user_id uuid references users(id),
  text text not null,
  fire_at timestamptz not null,
  recurrence text,                     -- null | cron-like string
  job_id text,                         -- pg-boss job id
  status text default 'scheduled',     -- scheduled | delivered | cancelled
  created_at timestamptz default now()
)

tasks (
  id uuid pk default gen_random_uuid(),
  user_id uuid references users(id),
  title text not null,
  status text default 'open',          -- open | done
  due_at timestamptz,
  created_at timestamptz default now()
)

oauth_tokens (
  user_id uuid references users(id),
  provider text not null,              -- 'google' (others later)
  access_token text,
  refresh_token text not null,
  expires_at timestamptz,
  scopes text[],
  primary key (user_id, provider)
)

baileys_auth (
  session_id text not null,
  key text not null,
  value jsonb not null,
  primary key (session_id, key)
)

files (
  id uuid pk default gen_random_uuid(),
  user_id uuid references users(id),
  storage_path text not null,          -- Supabase Storage path
  filename text,
  mime_type text,
  extracted_text text,
  created_at timestamptz default now()
)
```

Phase 4 adds `documents` and `document_chunks (embedding vector(1024))` for internal document search.

## Google OAuth flow (Vercel app)

1. User sends "connect google" to the bot. The `connect_google` tool generates a state token tied to the user id, stores it, and replies with a link to `https://<vercel-app>/api/auth/google?state=...`.
2. Vercel function redirects to Google's consent screen with scopes: Calendar, Gmail (send + read), Drive readonly, Sheets readonly. Request `access_type=offline` and `prompt=consent` to guarantee a refresh token.
3. Callback function exchanges the code, upserts into `oauth_tokens`, and shows a "Done, go back to WhatsApp" page.
4. Bot-side Google clients refresh access tokens automatically from the stored refresh token.

## Build phases

Build strictly in order. Each phase must run end-to-end before starting the next.

**Phase 1 — Core assistant (no external integrations)**
- Monorepo scaffold, Drizzle schema + migrations, Supabase connection
- Baileys adapter with Supabase auth state, QR pairing via logs, reconnect logic
- Express `/health` endpoint
- Agent loop with OpenAI tool calling
- Tools: `create_reminder`, `list_reminders`, `cancel_reminder`, `create_task`, `list_tasks`, `complete_task`, `schedule_followup`
- pg-boss worker delivering reminders
- Voice note transcription (Groq Whisper) feeding into the same loop
- Conversation history (last 20 turns) loaded per message
- Deploy to Render, verify keep-alive

**Phase 2 — Google suite**
- Vercel app with OAuth routes as described above
- Tools: `get_todays_meetings`, `create_calendar_event` (with Meet link + invites), `draft_email`, `send_email` (draft first, send only after user confirms in chat), `read_recent_emails`, `read_sheet`, `generate_report_from_sheet`

**Phase 3 — Business integrations**
- CRM (build against HubSpot free tier first, generic interface: `get_customer`, `log_activity`, `get_deals`)
- Accounting (Zoho Books or QuickBooks: `get_pending_invoices`, `get_payments`)
- Project management (ClickUp: `create_task_for`, `assign_task`, `list_team_tasks`) for task delegation

**Phase 4 — Documents and knowledge**
- Drive sync, chunking, embeddings into pgvector
- Tools: `search_documents`, `summarize_file` (works on any file the user sends in chat)

**Phase 5 — Meta Cloud API migration**
- Second `WhatsAppAdapter` implementation using Cloud API webhooks (received on Vercel, forwarded to or processed by the bot service)
- Utility message templates for reminders outside the 24-hour window
- Note: chat-summary / who-hasn't-replied / contacts features are Baileys-only and are excluded from the Cloud API build

## Environment variables

```
DATABASE_URL=            # Supabase pooler, session mode
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=     # https://<vercel-app>/api/auth/google/callback
BOT_PUBLIC_URL=          # Render URL, for health checks
ALLOWED_PHONES=          # comma-separated E.164 allowlist for testing
```

## Rules and conventions

- TypeScript strict mode. No `any` unless unavoidable.
- Every incoming message from a number not in `ALLOWED_PHONES` is ignored silently (testing safety: never let the bot answer strangers on a Baileys session).
- `send_email` and any destructive/outbound action must be confirmed by the user in chat before executing. The tool description must instruct the model to draft first and ask.
- All timestamps stored UTC; format for the user in their `timezone`.
- Log every agent-loop iteration (tool name + truncated input/result) for debugging.
- Never write files to local disk in `apps/bot`; use Supabase Storage.
- Keep each tool handler under ~100 lines; shared API clients live in `packages/core/src/clients/`.
- Reply style of the assistant persona: brief, practical, WhatsApp-appropriate (short messages, no markdown headers, use plain text and occasional lists).
- Use a throwaway phone number for the Baileys session. Never a personal number.

## Definition of done for Phase 1

From a whitelisted phone: send "remind me to call Ahmed at 4 PM" and receive the reminder at 4 PM local time; send a voice note saying "add order fabric to my to-do list" and see the task created; ask "what's on my to-do list" and get the list; all surviving a Render redeploy without rescanning the QR code.
