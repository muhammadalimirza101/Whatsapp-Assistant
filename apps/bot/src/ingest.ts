// Message ingestion: normalize an incoming WhatsApp message into plain text the
// agent loop can consume. Voice notes are transcribed via Groq Whisper.
import { transcribeAudio, type NormalizedMessage } from "@wa/core";
import { logger } from "./logger.js";

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

  // Phase 1: images/documents are acknowledged via their caption/filename only;
  // full document handling arrives in Phase 4.
  if (msg.type === "image" || msg.type === "document") {
    const caption = msg.text?.trim();
    if (caption) return { text: caption, msgType: msg.type };
    return {
      text: `[The user sent a ${msg.type}${msg.filename ? ` named "${msg.filename}"` : ""} with no caption. Attachments aren't processed yet; ask what they'd like done.]`,
      msgType: msg.type,
    };
  }

  return null;
}
