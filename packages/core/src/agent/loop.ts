// The agent loop: system prompt + history + tool catalog -> OpenAI, execute any
// tool calls, append results, repeat (max 10 iterations), return final text.
import type OpenAI from "openai";
import { openai, OPENAI_MODEL } from "../clients/openai.js";
import { openAiToolDefs, runTool, type UserContext } from "../tools/index.js";
import { buildSystemPrompt } from "./prompt.js";

const MAX_ITERATIONS = 10;

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

function truncate(s: string, n = 200): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * Run the agent for one incoming user message.
 * @param userText   the (already transcribed/normalized) user message text
 * @param history    prior turns (oldest first), excluding the current message
 * @param ctx        per-user tool context
 * @param log        logger for per-iteration debugging
 * @returns the assistant's final text reply
 */
export async function runAgent(
  userText: string,
  history: HistoryTurn[],
  ctx: UserContext,
  log: AgentLogger,
): Promise<string> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(ctx.user) },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userText },
  ];

  const tools = openAiToolDefs();
  const client = openai();

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      tools,
      tool_choice: "auto",
    });

    const choice = completion.choices[0];
    const msg = choice?.message;
    if (!msg) {
      log.error({ iteration }, "No message in completion");
      return "Sorry, I couldn't process that. Please try again.";
    }

    const toolCalls = msg.tool_calls ?? [];

    // No tool calls => this is the final answer.
    if (toolCalls.length === 0) {
      const text = msg.content?.trim();
      log.info({ iteration, final: true }, "Agent produced final response");
      return text && text.length > 0 ? text : "Done.";
    }

    // Push the assistant turn that requested the tools, then each tool result.
    messages.push({
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: msg.tool_calls,
    });

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      const { name, arguments: argsJson } = call.function;
      log.info(
        { iteration, tool: name, input: truncate(argsJson ?? "") },
        "Tool call",
      );
      const result = await runTool(name, argsJson ?? "", ctx);
      log.info(
        { iteration, tool: name, result: truncate(result) },
        "Tool result",
      );
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
  }

  log.warn({ maxIterations: MAX_ITERATIONS }, "Agent hit max iterations");
  return "I ran into a loop handling that. Could you rephrase your request?";
}
