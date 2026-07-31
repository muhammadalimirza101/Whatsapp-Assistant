import { getOrCreateList, addItem } from "../db/listStore.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  list?: unknown;
  item?: unknown;
}

export const addToList: AssistantTool = {
  name: "add_to_list",
  description:
    "Add an item to a named list (e.g. 'add milk to my groceries list', 'add laptop to shopping'). " +
    "Lists are created automatically on first use. Use the list name the user mentions; if they just say " +
    "'my list' with no name, use 'general'.",
  inputSchema: {
    type: "object",
    properties: {
      list: { type: "string", description: "The list name, e.g. 'groceries'. Defaults to 'general'." },
      item: { type: "string", description: "The item to add." },
    },
    required: ["item"],
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;
    const item = typeof input.item === "string" ? input.item.trim() : "";
    const listName = typeof input.list === "string" && input.list.trim() ? input.list.trim() : "general";
    if (!item) return "Error: nothing to add was provided.";

    const listId = await getOrCreateList(ctx.user.id, listName);
    await addItem(listId, item);
    return `Added "${item}" to your ${listName} list.`;
  },
};
