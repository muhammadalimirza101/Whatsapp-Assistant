// The WhatsApp adapter boundary. Baileys is one implementation (apps/bot);
// the Meta Cloud API will be a second (Phase 5). Nothing outside an adapter
// implementation may import a WhatsApp library directly.

export interface NormalizedMessage {
  from: string; // E.164 phone number
  type: "text" | "audio" | "document" | "image";
  text?: string;
  mediaBuffer?: Buffer;
  mimeType?: string;
  filename?: string;
  timestamp: Date;
}

export type MessageHandler = (msg: NormalizedMessage) => Promise<void>;

export interface WhatsAppAdapter {
  connect(): Promise<void>;
  sendText(to: string, text: string): Promise<void>;
  sendDocument(to: string, fileUrl: string, filename: string): Promise<void>;
  onMessage(handler: MessageHandler): void;
}
