import { purgeOldDailyRecords } from "@/services/RecordRetentionService";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // once/day

/** Runs one purge pass; never throws — logs and swallows any failure. */
export async function runRecordRetentionOnce(): Promise<void> {
  try {
    const { cutoff, deletedCount } = await purgeOldDailyRecords();
    console.log(
      `[RecordRetentionJob] Purged ${deletedCount} daily_records row(s) with workDate < ${cutoff.toISOString().slice(0, 10)}`
    );
  } catch (err) {
    console.error("[RecordRetentionJob] Purge failed:", err);
  }
}

/**
 * Starts the retention purge: runs once immediately (covers Render restarts/
 * missed runs), then every `intervalMs`. An in-flight guard ensures a slow or
 * stuck run is never overlapped by the next scheduled tick.
 */
export function startRecordRetentionJob(
  intervalMs: number = DEFAULT_INTERVAL_MS
): NodeJS.Timeout {
  let isRunning = false;

  const runIfIdle = (): void => {
    if (isRunning) {
      console.log("[RecordRetentionJob] Skipping run — a previous purge is still in progress.");
      return;
    }
    isRunning = true;
    void runRecordRetentionOnce().finally(() => {
      isRunning = false;
    });
  };

  runIfIdle();
  return setInterval(runIfIdle, intervalMs);
}
