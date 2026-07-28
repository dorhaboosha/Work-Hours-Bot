import { deleteDailyRecordsBefore } from "@/repositories/DailyRecordRepository";
import { startOfCurrentUtcMonth } from "@/utils/DateUtils";

export interface PurgeResult {
  cutoff: Date;
  deletedCount: number;
}

/**
 * Deletes all daily_records rows dated in any fully-completed past UTC month,
 * for every user. Safe to call repeatedly (daily, and once at process startup):
 * re-running after a successful purge is a no-op (deletedCount = 0).
 */
export async function purgeOldDailyRecords(now: Date = new Date()): Promise<PurgeResult> {
  const cutoff = startOfCurrentUtcMonth(now);
  const deletedCount = await deleteDailyRecordsBefore(cutoff);
  return { cutoff, deletedCount };
}
