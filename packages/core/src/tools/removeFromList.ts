import { removeItem } from "../db/listStore.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  list?: unknown;
  item?: unknown;
}

export const removeFromList: AssistantTool = {
  name: "remove_from_list",
  description:
    "Remove an item from a named list (e.g. 'remove milk from groceries', 'take laptop off shopping'). " +
    "If no list is named, use 'general'. Matches the item by its text.",
  inputSchema: {
    type: "object",
    properties: {
      list: { type: "string", description: "The list name. Defaults to 'general'." },
      item: { type: "string", description: "The item text to remove (partial match allowed)." },
    },
    required: ["item"],
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;
    const item = typeof input.item === "string" ? input.item.trim() : "";
    const listName = typeof input.list === "string" && input.list.trim() ? input.list.trim() : "general";
    if (!item) return "Error: specify what to remove.";

    const removed = await removeItem(ctx.user.id, listName, item);
    if (!removed) return `Couldn't find "${item}" on your ${listName} list.`;
    return `Removed "${removed}" from your ${listName} list.`;
  },
};
