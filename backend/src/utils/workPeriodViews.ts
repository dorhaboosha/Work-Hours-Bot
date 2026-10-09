import type { WorkPeriodView } from "@shared/types/ViewTypes";
import { minutesBetween } from "@/utils/DateUtils";

/** Maps a day's periods to their view shape; an open period counts up to `now`. */
export function toWorkPeriodViews(
  periods: ReadonlyArray<{ startTime: Date; endTime: Date | null }>,
  now: Date = new Date()
): WorkPeriodView[] {
  return periods.map((p) => ({
    startTime: p.startTime.toISOString(),
    endTime: p.endTime?.toISOString() ?? null,
    workedMinutes: minutesBetween(p.startTime, p.endTime ?? now),
  }));
}
