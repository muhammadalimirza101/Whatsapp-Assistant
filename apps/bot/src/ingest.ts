// Message ingestion: normalize an incoming WhatsApp message into plain text the
// agent loop can consume. Voice notes are transcribed via Groq Whisper.
import { transcribeAudio, type NormalizedMessage } from "@wa/core";
import { logger } from "./logger.js";
import { extractDocumentText } from "./extract.js";

export interface IngestResult {
  text: string;
  msgType: "text" | "audio" | "document" | "image";
}

/**
 * Turn a NormalizedMessage into text. Returns null when there is nothing
 * actionable (e.g. an unsupported attachment with no caption).
 */
export async function ingest(msg: NormalizedMessage): Promise<IngestResult | null> {
  if (msg.type === "text") {
    const text = msg.text?.trim();
    return text ? { text, msgType: "text" } : null;
  }

  if (msg.type === "audio") {
    if (!msg.mediaBuffer) return null;
    logger.info({ from: msg.from, bytes: msg.mediaBuffer.length }, "Transcribing voice note");
    try {
      const transcript = await transcribeAudio(
        msg.mediaBuffer,
        msg.mimeType ?? "audio/ogg",
        msg.filename ?? "voice-note.ogg",
      );
      const text = transcript.trim();
      if (!text) return null;
      logger.info({ from: msg.from, chars: text.length }, "Voice note transcribed");
      return { text, msgType: "audio" };
    } catch (err) {
      logger.error({ err, from: msg.from }, "Transcription failed");
      return {
        text: "[The user sent a voice note that could not be transcribed. Ask them to resend or type it.]",
        msgType: "audio",
      };
    }
  }

  // Documents: extract text (PDF / text / CSV / md) and hand it to the agent so
  // it can summarize, answer questions, or remember it.
  if (msg.type === "document") {
    const caption = msg.text?.trim();
    if (msg.mediaBuffer) {
      const extracted = await extractDocumentText(
        msg.mediaBuffer,
        msg.mimeType ?? "application/octet-stream",
        msg.filename ?? "document",
      );
      if (extracted) {
        const name = msg.filename ? ` "${msg.filename}"` : "";
        const ask = caption ? `\n\nThe user's message with it: ${caption}` : "";
        return {
          text:
            `[The user sent a document${name}. Its extracted text is below. ` +
            `Summarize it, answer any question about it, or store key facts with the remember tool as appropriate.]` +
            `\n\n---\n${extracted}\n---${ask}`,
          msgType: "document",
        };
      }
    }
    if (caption) return { text: caption, msgType: "document" };
    return {
      text: `[The user sent a document${msg.filename ? ` named "${msg.filename}"` : ""} that couldn't be read (unsupported type). Ask them to send a PDF or text file, or type the content.]`,
      msgType: "document",
    };
  }

  // Images: Phase-1 behavior — acknowledge via caption; OCR/vision is future work.
  if (msg.type === "image") {
    const caption = msg.text?.trim();
    if (caption) return { text: caption, msgType: "image" };
    return {
      text: "[The user sent an image with no caption. I can't view image contents yet; ask what they'd like done with it.]",
      msgType: "image",
    };
  }

  return null;
}
