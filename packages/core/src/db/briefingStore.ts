// Daily-briefing digest builder: assembles a user's day from tasks + reminders.
// (Calendar meetings are added by the bot layer when Google is connected.)
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "./client.js";
import { reminders, tasks, users } from "./schema.js";
import { formatInTz } from "../util/time.js";

/**
 * Offset (in ms) of the given IANA timezone from UTC at instant `at`.
 * Positive for timezones ahead of UTC (e.g. Asia/Karachi = +5h).
 */
function tzOffsetMs(timeZone: string, at: Date): number {
  // Format `at` as if it were wall-clock time in the zone, parse back as UTC,
  // and diff against the true UTC instant.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(at);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - at.getTime();
}

export interface BriefingUser {
  id: string;
  phone: string;
  timezone: string;
  briefingHour: number | null;
}

/** All users who have a briefing hour set (digest enabled). */
export async function usersWithBriefings(): Promise<BriefingUser[]> {
  const rows = await db
    .select({
      id: users.id,
      phone: users.phone,
      timezone: users.timezone,
      briefingHour: users.briefingHour,
    })
    .from(users);
  return rows.filter((r): r is BriefingUser => r.briefingHour !== null);
}

/** Set (or clear, with null) a user's daily briefing hour. */
export async function setBriefingHour(userId: string, hour: number | null): Promise<void> {
  await db.update(users).set({ briefingHour: hour }).where(eq(users.id, userId));
}

/**
 * Build the digest text for a user for "today" in their timezone.
 * Returns null if there's genuinely nothing to report.
 */
export async function buildBriefing(
  user: { id: string; timezone: string },
  extraMeetings?: string[],
): Promise<string | null> {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: user.timezone,
    year: "numeric",
    month: "2-digit",
    day: "numeric",
  }).format(now); // e.g. "2026-07-31" (the user's local date)

  // Build the day's UTC boundaries for the user's timezone. Compute the zone's
  // offset from UTC at `now`, then map local midnight/end-of-day to UTC instants.
  const offsetMs = tzOffsetMs(user.timezone, now);
  const dayStart = new Date(`${ymd}T00:00:00.000Z`).getTime() - offsetMs;
  const dayEndMs = new Date(`${ymd}T23:59:59.999Z`).getTime() - offsetMs;
  const dayStartDate = new Date(dayStart);
  const dayEnd = new Date(dayEndMs);

  // Open tasks due today (or overdue).
  const dueTasks = await db
    .select({ title: tasks.title, dueAt: tasks.dueAt })
    .from(tasks)
    .where(and(eq(tasks.userId, user.id), eq(tasks.status, "open"), lte(tasks.dueAt, dayEnd)))
    .orderBy(asc(tasks.dueAt));

  // Reminders scheduled to fire today.
  const todayReminders = await db
    .select({ text: reminders.text, fireAt: reminders.fireAt })
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, user.id),
        eq(reminders.status, "scheduled"),
        gte(reminders.fireAt, dayStartDate),
        lte(reminders.fireAt, dayEnd),
      ),
    )
    .orderBy(asc(reminders.fireAt));

  const sections: string[] = [];

  if (extraMeetings && extraMeetings.length > 0) {
    sections.push(`📅 Meetings:\n${extraMeetings.map((m) => `• ${m}`).join("\n")}`);
  }
  if (dueTasks.length > 0) {
    const lines = dueTasks.map((t) => {
      const due = t.dueAt ? ` (${formatInTz(t.dueAt, user.timezone)})` : "";
      return `• ${t.title}${due}`;
    });
    sections.push(`✅ Tasks due:\n${lines.join("\n")}`);
  }
  if (todayReminders.length > 0) {
    const lines = todayReminders.map((r) => `• ${r.text} — ${formatInTz(r.fireAt, user.timezone)}`);
    sections.push(`⏰ Reminders:\n${lines.join("\n")}`);
  }

  if (sections.length === 0) return null;
  return `Good morning! Here's your day:\n\n${sections.join("\n\n")}`;
}
