import { addMinutesUtc, minutesBetween } from "@/utils/DateUtils";

/**
 * Calculates the expected end time for a workday.
 * expectedEndTime = startTime + dailyRequiredMinutes (in UTC)
 */
export function calcExpectedEndTime(
  startTime: Date,
  dailyRequiredMinutes: number
): Date {
  return addMinutesUtc(startTime, dailyRequiredMinutes);
}

/**
 * Calculates the number of whole minutes worked between startTime and endTime.
 * Result is always >= 0.
 */
export function calcWorkedMinutes(startTime: Date, endTime: Date): number {
  return minutesBetween(startTime, endTime);
}

/**
 * Total worked minutes across a day's work periods. A closed period counts
 * start → end; an open period (endTime null) counts start → `now`.
 * Used for /status, /end and open-day contributions to summaries.
 */
export function calcPeriodsWorkedMinutes(
  periods: ReadonlyArray<{ startTime: Date; endTime: Date | null }>,
  now: Date = new Date()
): number {
  return periods.reduce(
    (total, p) => total + minutesBetween(p.startTime, p.endTime ?? now),
    0
  );
}

/**
 * Calculates the balance: workedMinutes - requiredMinutes.
 * Positive = overtime, negative = deficit, zero = exact.
 */
export function calcBalance(
  workedMinutes: number,
  requiredMinutes: number
): number {
  return workedMinutes - requiredMinutes;
}

/**
 * Calculates remaining minutes until the required daily total is reached,
 * clamped to 0 (never negative).
 */
export function calcRemainingMinutes(
  workedMinutesSoFar: number,
  dailyRequiredMinutes: number
): number {
  return Math.max(0, dailyRequiredMinutes - workedMinutesSoFar);
}
