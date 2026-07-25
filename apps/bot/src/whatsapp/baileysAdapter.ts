// Baileys implementation of the WhatsAppAdapter. This is the ONLY place in the
// bot that imports Baileys directly (Phase 5 adds a Cloud API adapter alongside).
import {
  makeWASocket,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type WAMessage,
  type ConnectionState,
  type BaileysEventMap,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import type {
  MessageHandler,
  NormalizedMessage,
  WhatsAppAdapter,
} from "@wa/core";
import { toIdentity } from "@wa/core";
import { logger } from "../logger.js";
import { useSupabaseAuthState } from "./supabaseAuthState.js";

const RECONNECT_DELAY_MS = 3000;

export class BaileysAdapter implements WhatsAppAdapter {
  private sock: WASocket | undefined;
  private handler: MessageHandler | undefined;
  private readonly sessionId: string;
  private stopping = false;
  private connected = false;

  /** True once the WhatsApp socket has reported connection === "open". */
  isConnected(): boolean {
    return this.connected;
  }

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  async connect(): Promise<void> {
    const { state, saveCreds } = await useSupabaseAuthState(this.sessionId);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false, // we render the QR ourselves, to logs
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    this.sock = sock;

    sock.ev.on("creds.update", () => {
      void saveCreds();
    });

    sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        logger.info("Scan this QR code with WhatsApp (Linked Devices):");
        qrcode.generate(qr, { small: true });
      }
      if (connection === "open") {
        this.connected = true;
        logger.info("WhatsApp connection open.");
      }
      if (connection === "close") {
        this.connected = false;
        this.handleClose(lastDisconnect?.error);
      }
    });

    sock.ev.on(
      "messages.upsert",
      ({ messages, type }: BaileysEventMap["messages.upsert"]) => {
        if (type !== "notify") return;
        for (const m of messages) {
          void this.dispatch(m);
        }
      },
    );
  }

  private handleClose(error: Error | undefined): void {
    // Baileys wraps disconnects in a Boom error carrying output.statusCode.
    // Read it structurally to avoid a direct @hapi/boom dependency.
    const statusCode = (
      error as { output?: { statusCode?: number } } | undefined
    )?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;

    if (loggedOut) {
      logger.error(
        "WhatsApp session logged out. Auth cleared server-side; a new QR scan is required.",
      );
      return; // do not auto-reconnect a logged-out session
    }
    if (this.stopping) return;

    logger.warn(
      { statusCode },
      `WhatsApp connection closed; reconnecting in ${RECONNECT_DELAY_MS}ms...`,
    );
    setTimeout(() => {
      this.connect().catch((e) => logger.error(e, "Reconnect failed"));
    }, RECONNECT_DELAY_MS);
  }

  private async dispatch(m: WAMessage): Promise<void> {
    if (!this.handler) return;
    if (m.key.fromMe) return; // ignore our own echoes
    const remoteJid = m.key.remoteJid ?? "";
    if (remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") return; // ignore groups/status

    const normalized = await this.normalize(m, remoteJid);
    if (!normalized) return;
    await this.handler(normalized);
  }

  private async normalize(
    m: WAMessage,
    remoteJid: string,
  ): Promise<NormalizedMessage | undefined> {
    // Canonical identity: "+<digits>" for phone JIDs, "lid:<digits>" for LIDs.
    // This is what the allowlist and user record key on; toJid() reverses it
    // when we reply, so the original @lid / @s.whatsapp.net routing is kept.
    const from = toIdentity(remoteJid);
    const timestamp = this.toDate(m.messageTimestamp);
    const msg = m.message;
    if (!msg) return undefined;

    const text =
      msg.conversation ??
      msg.extendedTextMessage?.text ??
      undefined;
    if (text) {
      return { from, type: "text", text, timestamp };
    }

    if (msg.audioMessage) {
      const mediaBuffer = await this.download(m);
      return {
        from,
        type: "audio",
        mediaBuffer,
        mimeType: msg.audioMessage.mimetype ?? "audio/ogg",
        timestamp,
      };
    }

    if (msg.imageMessage) {
      const mediaBuffer = await this.download(m);
      return {
        from,
        type: "image",
        mediaBuffer,
        mimeType: msg.imageMessage.mimetype ?? "image/jpeg",
        text: msg.imageMessage.caption ?? undefined,
        timestamp,
      };
    }

    if (msg.documentMessage) {
      const mediaBuffer = await this.download(m);
      return {
        from,
        type: "document",
        mediaBuffer,
        mimeType: msg.documentMessage.mimetype ?? "application/octet-stream",
        filename: msg.documentMessage.fileName ?? "document",
        timestamp,
      };
    }

    return undefined; // unsupported message kind (reaction, sticker, etc.)
  }

  private async download(m: WAMessage): Promise<Buffer> {
    return (await downloadMediaMessage(m, "buffer", {})) as Buffer;
  }

  private toDate(ts: WAMessage["messageTimestamp"]): Date {
    if (typeof ts === "number") return new Date(ts * 1000);
    if (ts && typeof ts === "object" && "toNumber" in ts) {
      return new Date((ts as { toNumber(): number }).toNumber() * 1000);
    }
    return new Date();
  }

  /**
   * Reverse a canonical identity back to a WhatsApp JID for sending.
   *   "lid:123" -> "123@lid"
   *   "+123" / "123" -> "123@s.whatsapp.net"
   * A raw JID passed straight through is returned unchanged.
   */
  private jid(to: string): string {
    if (to.includes("@")) return to; // already a JID
    const digits = to.replace(/[^\d]/g, "");
    if (/^lid:/i.test(to)) return `${digits}@lid`;
    return `${digits}@s.whatsapp.net`;
  }

  async sendText(to: string, text: string): Promise<void> {
    if (!this.sock) throw new Error("Adapter not connected.");
    await this.sock.sendMessage(this.jid(to), { text });
  }

  async sendDocument(to: string, fileUrl: string, filename: string): Promise<void> {
    if (!this.sock) throw new Error("Adapter not connected.");
    await this.sock.sendMessage(this.jid(to), {
      document: { url: fileUrl },
      fileName: filename,
      mimetype: "application/octet-stream",
    });
  }

  async close(): Promise<void> {
    this.stopping = true;
    this.sock?.end(undefined);
  }
}
