import { getListItems } from "../db/listStore.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  list?: unknown;
}

export const showList: AssistantTool = {
  name: "show_list",
  description:
    "Show the items on a named list (e.g. 'what's on my groceries list', 'show my shopping list'). " +
    "If the user doesn't name a list, use 'general'.",
  inputSchema: {
    type: "object",
    properties: {
      list: { type: "string", description: "The list name to show. Defaults to 'general'." },
    },
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const name =
      typeof (raw as Input).list === "string" && (raw as Input).list
        ? String((raw as Input).list).trim()
        : "general";

    const result = await getListItems(ctx.user.id, name);
    if (!result) return `You don't have a "${name}" list yet.`;
    if (result.items.length === 0) return `Your ${result.name} list is empty.`;

    const lines = result.items.map((it) => `${it.checked ? "✓" : "•"} ${it.content}`);
    return `${result.name} list:\n${lines.join("\n")}`;
  },
};
