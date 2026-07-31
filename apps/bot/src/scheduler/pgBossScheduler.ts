// pg-boss scheduler: runs the `reminders` and `followups` queues inside the
// Render process. On job fire, it sends the reminder/follow-up text via the
// WhatsApp adapter and marks the reminders row delivered. Recurring reminders
// reschedule themselves.
//
// Implements the core `Scheduler` interface so tools stay decoupled from pg-boss.
// All DB access goes through @wa/core (apps/bot never imports drizzle-orm).
import PgBoss from "pg-boss";
import {
  getReminderForDelivery,
  markReminderDelivered,
  rescheduleRecurringReminder,
  usersWithBriefings,
  buildBriefing,
  type Scheduler,
  type WhatsAppAdapter,
} from "@wa/core";
import { logger } from "../logger.js";
import { nextCronDate } from "./cron.js";

export const REMINDERS_QUEUE = "reminders";
export const FOLLOWUPS_QUEUE = "followups";
export const BRIEFINGS_QUEUE = "briefings";

/** Current hour (0–23) in a given IANA timezone. */
function hourInTz(timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  // "24" can appear at midnight in some environments; normalize to 0.
  const n = Number(h);
  return n === 24 ? 0 : n;
}

interface JobData {
  reminderId: string;
  userId: string;
}

export class PgBossScheduler implements Scheduler {
  private readonly boss: PgBoss;
  private readonly adapter: WhatsAppAdapter;

  constructor(connectionString: string, adapter: WhatsAppAdapter) {
    this.boss = new PgBoss({ connectionString, schema: "pgboss" });
    this.adapter = adapter;
    this.boss.on("error", (err) => logger.error(err, "pg-boss error"));
  }

  async start(): Promise<void> {
    await this.boss.start();
    await this.boss.createQueue(REMINDERS_QUEUE);
    await this.boss.createQueue(FOLLOWUPS_QUEUE);
    await this.boss.createQueue(BRIEFINGS_QUEUE);
    await this.boss.work<JobData>(REMINDERS_QUEUE, (jobs) => this.deliver(jobs));
    await this.boss.work<JobData>(FOLLOWUPS_QUEUE, (jobs) => this.deliver(jobs));
    await this.boss.work(BRIEFINGS_QUEUE, () => this.runBriefings());

    // Run the briefings check once an hour, on the hour. Each run sends digests
    // to users whose local briefing hour matches the current hour.
    await this.boss.schedule(BRIEFINGS_QUEUE, "0 * * * *");
    logger.info("pg-boss scheduler started (reminders, followups, briefings).");
  }

  async stop(): Promise<void> {
    await this.boss.stop();
  }

  async scheduleReminder(input: {
    reminderId: string;
    userId: string;
    fireAt: Date;
  }): Promise<string> {
    return this.enqueue(REMINDERS_QUEUE, input);
  }

  async scheduleFollowup(input: {
    reminderId: string;
    userId: string;
    fireAt: Date;
  }): Promise<string> {
    return this.enqueue(FOLLOWUPS_QUEUE, input);
  }

  async cancelJob(jobId: string): Promise<void> {
    // We don't track which queue a job is in, so try both. Unknown ids are
    // harmless no-ops.
    for (const queue of [REMINDERS_QUEUE, FOLLOWUPS_QUEUE]) {
      try {
        await this.boss.cancel(queue, jobId);
      } catch {
        // ignore: job may not exist in this queue, or may have already fired.
      }
    }
  }

  private async enqueue(
    queue: string,
    input: { reminderId: string; userId: string; fireAt: Date },
  ): Promise<string> {
    const data: JobData = { reminderId: input.reminderId, userId: input.userId };
    const jobId = await this.boss.sendAfter(queue, data, {}, input.fireAt);
    if (!jobId) throw new Error("pg-boss did not return a job id");
    return jobId;
  }

  /** Hourly worker: send the daily briefing to users whose local hour matches. */
  private async runBriefings(): Promise<void> {
    const users = await usersWithBriefings();
    for (const user of users) {
      try {
        if (user.briefingHour !== hourInTz(user.timezone)) continue;
        const text = await buildBriefing(user);
        if (!text) continue; // nothing to report today
        await this.adapter.sendText(user.phone, text);
        logger.info({ userId: user.id }, "Daily briefing sent");
      } catch (err) {
        logger.error({ err, userId: user.id }, "Failed to send briefing");
      }
    }
  }

  /** Worker: deliver each fired reminder/follow-up. */
  private async deliver(jobs: PgBoss.Job<JobData>[]): Promise<void> {
    for (const job of jobs) {
      try {
        await this.deliverOne(job.data.reminderId);
      } catch (err) {
        logger.error({ err, reminderId: job.data.reminderId }, "Failed to deliver reminder");
        throw err; // let pg-boss retry per its policy
      }
    }
  }

  private async deliverOne(reminderId: string): Promise<void> {
    const row = await getReminderForDelivery(reminderId);

    if (!row) {
      logger.warn({ reminderId }, "Reminder row missing; skipping");
      return;
    }
    if (row.status !== "scheduled") {
      logger.info({ reminderId, status: row.status }, "Reminder not scheduled; skipping");
      return;
    }
    if (!row.userId || !row.userPhone) {
      logger.warn({ reminderId }, "Reminder has no user/phone; skipping");
      return;
    }

    await this.adapter.sendText(row.userPhone, `⏰ ${row.text}`);

    if (row.recurrence) {
      // Reschedule the next occurrence; keep the row 'scheduled'.
      const next = nextCronDate(row.recurrence, new Date());
      if (next) {
        const newJobId = await this.enqueue(REMINDERS_QUEUE, {
          reminderId: row.id,
          userId: row.userId,
          fireAt: next,
        });
        await rescheduleRecurringReminder(row.id, newJobId, next);
        logger.info({ reminderId, next }, "Recurring reminder rescheduled");
        return;
      }
      logger.warn({ reminderId, recurrence: row.recurrence }, "Bad cron; not rescheduling");
    }

    await markReminderDelivered(row.id);
    logger.info({ reminderId }, "Reminder delivered");
  }
}
