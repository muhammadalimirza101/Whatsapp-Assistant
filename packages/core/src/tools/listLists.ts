import { getUserLists } from "../db/listStore.js";
import type { AssistantTool, UserContext } from "./types.js";

export const listLists: AssistantTool = {
  name: "list_lists",
  description:
    "Show the names of all the user's lists (e.g. when they ask 'what lists do I have?'). " +
    "Use show_list to see the items inside a specific list.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  handler: async (_raw: unknown, ctx: UserContext): Promise<string> => {
    const rows = await getUserLists(ctx.user.id);
    if (rows.length === 0) return "You don't have any lists yet.";
    return `Your lists:\n${rows.map((r) => `• ${r.name}`).join("\n")}`;
  },
};
