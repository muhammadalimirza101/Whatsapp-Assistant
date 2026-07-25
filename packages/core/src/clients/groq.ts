// Groq Whisper transcription client. Uses Groq's OpenAI-compatible audio
// transcription endpoint. Node 20+ provides fetch/FormData/Blob natively.
const GROQ_TRANSCRIBE_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";

export const GROQ_MODEL = process.env.GROQ_MODEL ?? "whisper-large-v3";

/**
 * Transcribe an audio buffer (e.g. a WhatsApp voice note, typically OGG/Opus)
 * to text via Groq Whisper. Returns the transcript, or throws on API error.
 */
export async function transcribeAudio(
  buffer: Buffer,
  mimeType = "audio/ogg",
  filename = "voice-note.ogg",
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set.");

  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  form.append("file", blob, filename);
  form.append("model", GROQ_MODEL);
  form.append("response_format", "text");
  form.append("temperature", "0");

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq transcription failed (${res.status}): ${detail}`);
  }

  // response_format=text returns the raw transcript string.
  const text = (await res.text()).trim();
  return text;
}
