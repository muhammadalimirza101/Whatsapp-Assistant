// Identity helpers shared across adapters and the allowlist check.
//
// WhatsApp delivers a sender identity in one of two forms:
//   - a phone JID   "923001234567@s.whatsapp.net"  -> a real E.164 number
//   - a LID         "76562187714593@lid"           -> a privacy identifier that
//     is NOT a phone number (WhatsApp increasingly delivers these instead)
//
// We normalize each to a canonical string:
//   - phone / typed number -> "+<digits>"      e.g. "+923001234567"
//   - LID                  -> "lid:<digits>"   e.g. "lid:76562187714593"
// The allowlist accepts either form, so during testing you can whitelist a
// bare phone number and/or a "lid:<digits>" entry.

/** Canonicalize a WhatsApp JID or user-typed identifier to a stable id. */
export function toIdentity(input: string): string {
  const trimmed = input.trim();
  const [local = "", domain = ""] = trimmed.split("@");
  const digits = local.replace(/[^\d]/g, "");
  if (!digits) return "";

  // Explicit LID, either as a JID (…@lid) or a typed "lid:123" entry.
  if (domain === "lid" || /^lid:/i.test(trimmed)) {
    return `lid:${digits}`;
  }
  return `+${digits}`;
}

/**
 * Backwards-compatible E.164 normalizer for non-LID numbers. Kept for callers
 * that specifically want a phone string; LIDs pass through toIdentity instead.
 */
export function toE164(input: string): string {
  const id = toIdentity(input);
  return id.startsWith("lid:") ? "" : id;
}

/** Parse ALLOWED_PHONES (comma-separated E.164 and/or lid:<digits>) into a set. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  const set = new Set<string>();
  if (!raw) return set;
  for (const part of raw.split(",")) {
    const id = toIdentity(part.trim());
    if (id) set.add(id);
  }
  return set;
}

/** True if `sender` (JID or typed id) is in the allowlist set. */
export function isAllowed(sender: string, allowlist: Set<string>): boolean {
  return allowlist.has(toIdentity(sender));
}
