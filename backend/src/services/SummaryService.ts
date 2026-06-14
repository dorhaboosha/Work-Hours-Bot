import { DateTime } from "luxon";
import type { Weekday } from "@shared/types/CoreTypes";
import type { DailyRecord } from "@/generated/prisma/client";
import { listRecordsByRange } from "@/repositories/DailyRecordRepository";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { utcToLocalDate } from "@/utils/DateUtils";
import { calcWorkedMinutesSoFar } from "@/services/TimeCalculationService";
import type { WorkSummary } from "@shared/types/ViewTypes";

// ── Internal types ────────────────────────────────────────────────────────────

/**
 * The resolved week window for a given reference date and workday config.
 * All date strings are YYYY-MM-DD in the user's local timezone.
 */
export interface WeekWindow {
  /** Sunday of the calendar week (may not be a workday). */
  calendarStart: string;
  /** Saturday of the calendar week (may not be a workday). */
  calendarEnd: string;
  /** First configured workday within the week — used as summary `startDate`. */
  startDate: string;
  /** Last configured workday within the week — used as summary `endDate`. */
  endDate: string;
  /** YYYY-MM-DD for every configured workday in the week, in ascending order. */
  workdayDates: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converts a Luxon weekday (1 = Mon … 7 = Sun) to the JS/spec convention
 * (0 = Sun, 1 = Mon … 6 = Sat).
 */
function luxonToJsWeekday(luxonWeekday: number): Weekday {
  return (luxonWeekday === 7 ? 0 : luxonWeekday) as Weekday;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Computes the Sun–Sat calendar week that contains `referenceDate` (YYYY-MM-DD)
 * in the user's timezone, then filters by `workdays` to produce the ordered
 * list of workday dates for that week.
 *
 * `referenceDate` defaults to today in the user's timezone when omitted.
 */
export function getWeekWindow(
  workdays: Weekday[],
  timezone: string,
  referenceDate?: string
): WeekWindow {
  const ref = referenceDate
    ? DateTime.fromISO(referenceDate, { zone: timezone })
    : DateTime.now().setZone(timezone);

  // Luxon: 1=Mon … 7=Sun. Offset to reach Sunday of this week.
  const daysFromSunday = ref.weekday === 7 ? 0 : ref.weekday;
  const sunday = ref.minus({ days: daysFromSunday }).startOf("day");
  const saturday = sunday.plus({ days: 6 });

  const workdayDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = sunday.plus({ days: i });
    if (workdays.includes(luxonToJsWeekday(day.weekday))) {
      workdayDates.push(day.toFormat("yyyy-MM-dd"));
    }
  }

  return {
    calendarStart: sunday.toFormat("yyyy-MM-dd"),
    calendarEnd: saturday.toFormat("yyyy-MM-dd"),
    startDate: workdayDates[0] ?? sunday.toFormat("yyyy-MM-dd"),
    endDate: workdayDates[workdayDates.length - 1] ?? saturday.toFormat("yyyy-MM-dd"),
    workdayDates,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * The resolved month window for a given YYYY-MM and workday config.
 * All date strings are YYYY-MM-DD in the user's local timezone.
 */
export interface MonthWindow {
  /** YYYY-MM of the period — used as summary `month`. */
  month: string;
  /** YYYY-MM-DD of the first day of the month. */
  startDate: string;
  /** YYYY-MM-DD of the last day of the month. */
  endDate: string;
  /** YYYY-MM-DD for every configured workday in the month, in ascending order. */
  workdayDates: string[];
}

/**
 * Computes all configured workday dates within the given calendar month.
 *
 * `referenceMonth` is YYYY-MM; defaults to the current month in the user's
 * timezone when omitted.
 */
export function getMonthWindow(
  workdays: Weekday[],
  timezone: string,
  referenceMonth?: string
): MonthWindow {
  const ref = referenceMonth
    ? DateTime.fromISO(`${referenceMonth}-01`, { zone: timezone })
    : DateTime.now().setZone(timezone).startOf("month");

  const firstDay = ref.startOf("month");
  const daysInMonth = firstDay.daysInMonth ?? 31;

  const workdayDates: string[] = [];
  for (let i = 0; i < daysInMonth; i++) {
    const day = firstDay.plus({ days: i });
    if (workdays.includes(luxonToJsWeekday(day.weekday))) {
      workdayDates.push(day.toFormat("yyyy-MM-dd"));
    }
  }

  const lastDay = firstDay.endOf("month");

  return {
    month: firstDay.toFormat("yyyy-MM"),
    startDate: firstDay.toFormat("yyyy-MM-dd"),
    endDate: lastDay.toFormat("yyyy-MM-dd"),
    workdayDates,
  };
}

// ── Aggregation ───────────────────────────────────────────────────────────────

/**
 * Converts a local YYYY-MM-DD date string to a UTC midnight Date for use as a
 * Prisma `@db.Date` range boundary.
 */
function localDateToUtcMidnight(dateStr: string): Date {
  return DateTime.fromISO(dateStr, { zone: "utc" }).toJSDate();
}

interface AggregateResult {
  workdaysCount: number;
  requiredMinutes: number;
  workedMinutes: number;
  balanceMinutes: number;
}

/**
 * Aggregates totals across a list of expected workday dates.
 *
 * - Closed record present → use its stored `workedMinutes`.
 * - No record for the date  → counts as 0 worked (missing day).
 * - Open record (endTime = null) → caller should pass its `workedMinutes`
 *   pre-filled with the live worked-so-far value (task 7.5 responsibility).
 */
export function aggregateSummary(
  workdayDates: string[],
  records: DailyRecord[],
  dailyRequiredMinutes: number,
  timezone: string
): AggregateResult {
  // Build lookup: local date string → record
  const byDate = new Map<string, DailyRecord>();
  for (const rec of records) {
    byDate.set(utcToLocalDate(rec.workDate, timezone), rec);
  }

  let workedMinutes = 0;
  for (const date of workdayDates) {
    const rec = byDate.get(date);
    workedMinutes += rec?.workedMinutes ?? 0;
  }

  const workdaysCount = workdayDates.length;
  const requiredMinutes = workdaysCount * dailyRequiredMinutes;
  const balanceMinutes = workedMinutes - requiredMinutes;

  return { workdaysCount, requiredMinutes, workedMinutes, balanceMinutes };
}

// ── Open-day enrichment ───────────────────────────────────────────────────────

/**
 * If there is an open record whose local date falls within `workdayDates`,
 * replaces its `workedMinutes` in the array with the live worked-so-far value.
 *
 * `records` comes from `listRecordsByRange` and already includes open records
 * (no endTime filter). This keeps `aggregateSummary` side-effect-free.
 */
function enrichWithOpenDay(
  records: DailyRecord[],
  workdayDates: string[],
  timezone: string
): DailyRecord[] {
  const openRecord = records.find((r) => r.endTime === null);
  if (openRecord === null || openRecord === undefined) return records;

  const openDateStr = utcToLocalDate(openRecord.workDate, timezone);
  if (!workdayDates.includes(openDateStr)) return records;

  const liveMinutes = calcWorkedMinutesSoFar(openRecord.startTime);
  return records.map((r) =>
    r.id === openRecord.id ? { ...r, workedMinutes: liveMinutes } : r
  );
}

// ── Public service functions ──────────────────────────────────────────────────

/**
 * Returns the week summary for a user.
 * PREVIOUS_RECORD_STILL_OPEN guard is added in task 7.6.
 */
export async function getWeekSummary(
  telegramId: string,
  referenceDate?: string
): Promise<WorkSummary> {
  const settings = await getSettingsOrThrow(telegramId);
  const workdays = settings.workdays as Weekday[];
  const window = getWeekWindow(workdays, settings.timezone, referenceDate);

  const rawRecords =
    window.workdayDates.length > 0
      ? await listRecordsByRange(
          telegramId,
          localDateToUtcMidnight(window.workdayDates[0]),
          localDateToUtcMidnight(window.workdayDates[window.workdayDates.length - 1])
        )
      : [];

  const records = enrichWithOpenDay(
    rawRecords,
    window.workdayDates,
    settings.timezone
  );

  const { workdaysCount, requiredMinutes, workedMinutes, balanceMinutes } =
    aggregateSummary(
      window.workdayDates,
      records,
      settings.dailyRequiredMinutes,
      settings.timezone
    );

  return {
    period: "week",
    startDate: window.startDate,
    endDate: window.endDate,
    workdaysCount,
    requiredMinutes,
    workedMinutes,
    balanceMinutes,
  };
}

/**
 * Returns the month summary for a user.
 * PREVIOUS_RECORD_STILL_OPEN guard is added in task 7.6.
 */
export async function getMonthSummary(
  telegramId: string,
  referenceMonth?: string
): Promise<WorkSummary> {
  const settings = await getSettingsOrThrow(telegramId);
  const workdays = settings.workdays as Weekday[];
  const window = getMonthWindow(workdays, settings.timezone, referenceMonth);

  const rawRecords =
    window.workdayDates.length > 0
      ? await listRecordsByRange(
          telegramId,
          localDateToUtcMidnight(window.workdayDates[0]),
          localDateToUtcMidnight(window.workdayDates[window.workdayDates.length - 1])
        )
      : [];

  const records = enrichWithOpenDay(
    rawRecords,
    window.workdayDates,
    settings.timezone
  );

  const { workdaysCount, requiredMinutes, workedMinutes, balanceMinutes } =
    aggregateSummary(
      window.workdayDates,
      records,
      settings.dailyRequiredMinutes,
      settings.timezone
    );

  return {
    period: "month",
    month: window.month,
    workdaysCount,
    requiredMinutes,
    workedMinutes,
    balanceMinutes,
  };
}
