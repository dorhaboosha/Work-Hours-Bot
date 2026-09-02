import { deleteDailyRecordsBefore } from "@/repositories/DailyRecordRepository";
import { retentionCutoff } from "@/utils/DateUtils";

/**
 * Days of history kept beyond the current UTC month so a week that straddles a
 * month boundary never loses its previous-month days before that week is over.
 * The weekly summary window is the Sun–Sat week containing today, so the widest
 * lookback is ~6 days (today is Saturday) plus up to ~1 day of per-user timezone
 * skew; 10 rounds that up for margin.
 */
const RETENTION_TRAILING_BUFFER_DAYS = 10;

export interface PurgeResult {
  cutoff: Date;
  deletedCount: number;
}

/**
 * Deletes daily_records rows for every user once they fall outside the retention
 * window: strictly before the start of the current UTC month, but never within
 * the trailing buffer that protects an in-progress week (see
 * RETENTION_TRAILING_BUFFER_DAYS). Safe to call repeatedly (daily, and once at
 * process startup): re-running after a successful purge is a no-op
 * (deletedCount = 0).
 */
export async function purgeOldDailyRecords(now: Date = new Date()): Promise<PurgeResult> {
  const cutoff = retentionCutoff(now, RETENTION_TRAILING_BUFFER_DAYS);
  const deletedCount = await deleteDailyRecordsBefore(cutoff);
  return { cutoff, deletedCount };
}
