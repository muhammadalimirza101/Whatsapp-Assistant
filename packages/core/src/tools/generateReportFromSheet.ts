import { google, getUserOAuthClient } from "../clients/google.js";
import type { AssistantTool, UserContext } from "./types.js";

interface Input {
  spreadsheet_id?: unknown;
  range?: unknown;
}

function extractSheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m?.[1] ?? input.trim();
}

function isNumeric(v: string): boolean {
  return v.trim() !== "" && !Number.isNaN(Number(v.replace(/[$,%\s]/g, "")));
}

export const generateReportFromSheet: AssistantTool = {
  name: "generate_report_from_sheet",
  description:
    "Summarize a Google Sheet range into a report: row/column counts and totals/averages for numeric " +
    "columns. Provide the spreadsheet id/URL and A1 range (first row treated as headers). The model " +
    "should turn the returned figures into a short natural-language report. Requires Google connected.",
  inputSchema: {
    type: "object",
    properties: {
      spreadsheet_id: { type: "string", description: "Spreadsheet id or full Google Sheets URL." },
      range: { type: "string", description: "A1 range including a header row, e.g. 'Sheet1!A1:F100'." },
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

    const sheets = google.sheets({ version: "v4", auth });
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: extractSheetId(idRaw),
      range,
    });
    const rows = data.values ?? [];
    if (rows.length < 2) return "Not enough data to summarize (need a header row plus data).";

    const headers = rows[0]!.map((h) => String(h));
    const body = rows.slice(1);

    const summaries: string[] = [];
    for (let col = 0; col < headers.length; col++) {
      const cells = body.map((r) => String(r[col] ?? ""));
      const nums = cells.filter(isNumeric).map((v) => Number(v.replace(/[$,%\s]/g, "")));
      if (nums.length >= Math.max(2, body.length * 0.5)) {
        const sum = nums.reduce((a, b) => a + b, 0);
        const avg = sum / nums.length;
        summaries.push(
          `${headers[col]}: total ${sum.toLocaleString()}, avg ${avg.toFixed(2)} (n=${nums.length})`,
        );
      }
    }

    const head = `Rows: ${body.length}. Columns: ${headers.join(", ")}.`;
    const stats = summaries.length
      ? `\nNumeric summary:\n${summaries.join("\n")}`
      : "\n(No clearly numeric columns to aggregate.)";
    return `${head}${stats}`;
  },
};
