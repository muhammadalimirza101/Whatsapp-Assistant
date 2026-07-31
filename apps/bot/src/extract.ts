// Extract plain text from an incoming document buffer for the agent to work on.
// Supports PDF (pdf-parse), plain text, CSV, and markdown. Other types return null.
import { logger } from "./logger.js";

const MAX_CHARS = 12000; // cap what we feed the model

function looksTextual(mime: string, filename: string): boolean {
  return (
    mime.startsWith("text/") ||
    /\.(txt|csv|md|json|log)$/i.test(filename) ||
    mime === "application/json" ||
    mime === "text/csv"
  );
}

export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string | null> {
  try {
    if (mimeType === "application/pdf" || /\.pdf$/i.test(filename)) {
      // pdf-parse v2: new PDFParse({ data }).getText() -> { text }.
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const { text } = await parser.getText();
      return clip(text);
    }

    if (looksTextual(mimeType, filename)) {
      return clip(buffer.toString("utf-8"));
    }

    logger.info({ mimeType, filename }, "Unsupported document type for extraction");
    return null;
  } catch (err) {
    logger.error({ err, filename }, "Document extraction failed");
    return null;
  }
}

function clip(text: string): string {
  const t = text.trim();
  return t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS)}\n…[truncated]` : t;
}
