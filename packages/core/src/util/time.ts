// Timezone-aware formatting helpers. All timestamps are stored UTC; we format
// them into the user's IANA timezone for display.

/** Format a UTC Date into a friendly string in the given IANA timezone. */
export function formatInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Current wall-clock string in the user's timezone (for the system prompt). */
export function nowInTz(timeZone: string): string {
  return formatInTz(new Date(), timeZone);
}

/**
 * Parse a model-provided datetime string into a Date.
 * The model is instructed to emit an ISO 8601 string. If it includes an offset
 * or 'Z', that is authoritative. A bare "YYYY-MM-DDTHH:mm" (no offset) is
 * interpreted as already being UTC by the caller's contract, so we treat it as
 * such by appending 'Z' when no timezone designator is present.
 */
export function parseModelDate(value: string): Date | null {
  const trimmed = value.trim();
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed);
  const iso = hasTz ? trimmed : `${trimmed}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
