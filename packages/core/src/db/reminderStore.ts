// DB helpers for reminder delivery, kept in core so apps/bot never imports
// drizzle-orm directly.
import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { reminders, users } from "./schema.js";

export interface DeliverableReminder {
  id: string;
  text: string;
  status: string | null;
  recurrence: string | null;
  fireAt: Date;
  userId: string | null;
  userPhone: string | null;
}

/** Load a reminder joined with its user's phone, for delivery. */
export async function getReminderForDelivery(
  reminderId: string,
): Promise<DeliverableReminder | undefined> {
  const [row] = await db
    .select({
      id: reminders.id,
      text: reminders.text,
      status: reminders.status,
      recurrence: reminders.recurrence,
      fireAt: reminders.fireAt,
      userId: reminders.userId,
      userPhone: users.phone,
    })
    .from(reminders)
    .leftJoin(users, eq(reminders.userId, users.id))
    .where(eq(reminders.id, reminderId))
    .limit(1);
  return row;
}

export async function markReminderDelivered(reminderId: string): Promise<void> {
  await db.update(reminders).set({ status: "delivered" }).where(eq(reminders.id, reminderId));
}

export async function rescheduleRecurringReminder(
  reminderId: string,
  jobId: string,
  fireAt: Date,
): Promise<void> {
  await db
    .update(reminders)
    .set({ jobId, fireAt })
    .where(eq(reminders.id, reminderId));
}
