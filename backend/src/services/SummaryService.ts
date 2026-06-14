import { DateTime } from "luxon";
import type { Weekday } from "@shared/types/CoreTypes";

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
