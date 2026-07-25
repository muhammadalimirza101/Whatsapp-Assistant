import { google, getUserOAuthClient } from "../clients/google.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  spreadsheet_id?: unknown;
  range?: unknown;
}

/** Accept either a full Sheets URL or a bare spreadsheet id. */
function extractSheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m?.[1] ?? input.trim();
}

export const readSheet: AssistantTool = {
  name: "read_sheet",
  description:
    "Read cells from a Google Sheet. Provide the spreadsheet id or URL and an A1 range " +
    "(e.g. 'Sheet1!A1:D20'). Returns the rows as text. Requires Google connected.",
  inputSchema: {
    type: "object",
    properties: {
      spreadsheet_id: { type: "string", description: "Spreadsheet id or full Google Sheets URL." },
      range: { type: "string", description: "A1 notation range, e.g. 'Sheet1!A1:D20'." },
    },
    required: ["spreadsheet_id", "range"],
    additionalProperties: false,
  },
  handler: async (raw: unknown, ctx: UserContext): Promise<string> => {
    const input = raw as Input;
    const auth = await getUserOAuthClient(ctx.user.id);
    if (!auth) return "Google isn't connected yet. Use connect_google to link it first.";

    const idRaw = typeof input.spreadsheet_id === "string" ? input.spreadsheet_id : "";
    const range = typeof input.range === "string" ? input.range.trim() : "";
    if (!idRaw || !range) return "Error: spreadsheet_id and range are required.";
    const spreadsheetId = extractSheetId(idRaw);

    const sheets = google.sheets({ version: "v4", auth });
    const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = data.values ?? [];
    if (rows.length === 0) return "That range is empty.";

    const preview = rows
      .slice(0, 30)
      .map((r) => r.join(" | "))
      .join("\n");
    const more = rows.length > 30 ? `\n… (${rows.length - 30} more rows)` : "";
    return `Data from ${range}:\n${preview}${more}`;
  },
};
