// Tool registry. Every Phase 1 tool is registered here; the registry produces
// the `tools` array for the OpenAI chat completions call and dispatches calls
// back to the right handler.
//
// (Explicit registration rather than filesystem scanning: it is type-checked,
// survives compilation/bundling, and makes the catalog obvious at a glance.)
import type OpenAI from "openai";
import type { AssistantTool, UserContext } from "./types.js";

import { createReminder } from "./createReminder.js";
import { listReminders } from "./listReminders.js";
import { cancelReminder } from "./cancelReminder.js";
import { createTask } from "./createTask.js";
import { listTasks } from "./listTasks.js";
import { completeTask } from "./completeTask.js";
import { scheduleFollowup } from "./scheduleFollowup.js";

export * from "./types.js";

const ALL_TOOLS: readonly AssistantTool[] = [
  createReminder,
  listReminders,
  cancelReminder,
  createTask,
  listTasks,
  completeTask,
  scheduleFollowup,
];

const byName = new Map<string, AssistantTool>(ALL_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): AssistantTool | undefined {
  return byName.get(name);
}

export function listTools(): readonly AssistantTool[] {
  return ALL_TOOLS;
}

/** Build the OpenAI tool catalog from the registry. */
export function openAiToolDefs(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return ALL_TOOLS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as unknown as Record<string, unknown>,
    },
  }));
}

/** Execute a tool call by name; unknown tools and handler errors return strings. */
export async function runTool(
  name: string,
  argsJson: string,
  ctx: UserContext,
): Promise<string> {
  const tool = byName.get(name);
  if (!tool) return `Error: unknown tool "${name}".`;

  let parsed: unknown = {};
  if (argsJson && argsJson.trim()) {
    try {
      parsed = JSON.parse(argsJson);
    } catch {
      return `Error: could not parse arguments for ${name} as JSON.`;
    }
  }

  try {
    return await tool.handler(parsed, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error while running ${name}: ${msg}`;
  }
}
