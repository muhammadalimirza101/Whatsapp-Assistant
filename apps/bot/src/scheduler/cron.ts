import { CronExpressionParser } from "cron-parser";

/**
 * Given a cron expression and a reference time, return the next fire Date after
 * `from`, or null if the expression is invalid.
 */
export function nextCronDate(cron: string, from: Date): Date | null {
  try {
    const interval = CronExpressionParser.parse(cron, { currentDate: from });
    return interval.next().toDate();
  } catch {
    return null;
  }
}
