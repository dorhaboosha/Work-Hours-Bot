import { DateTime } from "luxon";
import type { Weekday } from "@shared/types/CoreTypes";
import type { DailyRecord } from "@/generated/prisma/client";
import { listRecordsByRange, findOpenRecord } from "@/repositories/DailyRecordRepository";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { getLocalDate, utcToLocalDate } from "@/utils/DateUtils";
import { calcWorkedMinutesSoFar } from "@/services/TimeCalculationService";
import { AppError } from "@/utils/AppError";
import type { WorkSummary } from "@shared/types/ViewTypes";
import { getWeekWindow, getMonthWindow } from "@/utils/dateRangeUtils";
import type { WeekWindow, MonthWindow } from "@/utils/dateRangeUtils";

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
 * Aggregates totals across a list of expected workday dates, crediting each
 * absence type correctly per §3.10 of the spec:
 *
 * - **Required minutes** = number of configured workdays × `dailyRequiredMinutes` (always full).
 * - **WORK record (closed)** → stored `workedMinutes` contributed to worked.
 * - **WORK record (open)**   → caller pre-fills `workedMinutes` with live value via `enrichWithOpenDay`.
 * - **Absence record**       → credited minutes (stored by `MARK_ABSENCE`) contributed to worked:
 *   SICK/VACATION/HOLIDAY/ELECTION → full day; HOLIDAY_EVE → half day; UNPAID_ABSENCE → 0.
 * - **No record**            → 0 worked, full required (missing day).
 *
 * Because required is always full, HOLIDAY_EVE and UNPAID_ABSENCE produce negative balances,
 * matching the single-day edit result and the spec formula.
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
    // All record types (WORK, absence, missing) contribute stored/credited workedMinutes.
    // SICK/VACATION/HOLIDAY/ELECTION store full day → balance 0.
    // HOLIDAY_EVE stores half day → balance = -half.
    // UNPAID_ABSENCE stores 0 → balance = -full.
    // WORK stores actual minutes; missing days contribute 0.
    workedMinutes += rec?.workedMinutes ?? 0;
  }

  const workdaysCount = workdayDates.length;
  const requiredMinutes = workdaysCount * dailyRequiredMinutes;
  const balanceMinutes = workedMinutes - requiredMinutes;

  return { workdaysCount, requiredMinutes, workedMinutes, balanceMinutes };
}

// ── Guards ────────────────────────────────────────────────────────────────────

/**
 * Throws PREVIOUS_RECORD_STILL_OPEN if the user has an open record whose
 * local date is before today. A today-open record is allowed (used as
 * worked-so-far in the summary).
 */
async function assertNoPreviousOpenRecord(
  telegramId: string,
  timezone: string
): Promise<void> {
  const openRecord = await findOpenRecord(telegramId);
  if (openRecord === null) return;

  const openDateStr = utcToLocalDate(openRecord.workDate, timezone);
  const todayStr = getLocalDate(timezone);

  if (openDateStr !== todayStr) {
    throw new AppError(
      "PREVIOUS_RECORD_STILL_OPEN",
      `You have an unfinished workday from ${openDateStr}. Use /edit ${openDateStr} to close it before viewing summaries.`
    );
  }
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

  if (!openRecord.startTime) return records;
  const liveMinutes = calcWorkedMinutesSoFar(openRecord.startTime);
  return records.map((r) =>
    r.id === openRecord.id ? { ...r, workedMinutes: liveMinutes } : r
  );
}

// ── Shared pipeline ───────────────────────────────────────────────────────────

interface SummaryCore {
  workdaysCount: number;
  requiredMinutes: number;
  workedMinutes: number;
  balanceMinutes: number;
}

/**
 * Runs the full summary pipeline for a single user:
 *   settings fetch → assertNoPreviousOpenRecord → windowBuilder
 *   → listRecordsByRange → enrichWithOpenDay → aggregateSummary
 *
 * The generic `W` carries the window-specific fields (e.g. `startDate`/`endDate`
 * for a week window, `month` for a month window) through to the return type,
 * so callers can access them without extra lookups.
 */
async function buildSummary<W extends { workdayDates: string[] }>(
  telegramId: string,
  windowBuilder: (workdays: Weekday[], timezone: string) => W
): Promise<W & SummaryCore> {
  const settings = await getSettingsOrThrow(telegramId);
  await assertNoPreviousOpenRecord(telegramId, settings.timezone);

  const win = windowBuilder(settings.workdays as Weekday[], settings.timezone);

  const rawRecords =
    win.workdayDates.length > 0
      ? await listRecordsByRange(
          telegramId,
          localDateToUtcMidnight(win.workdayDates[0]),
          localDateToUtcMidnight(win.workdayDates[win.workdayDates.length - 1])
        )
      : [];

  const records = enrichWithOpenDay(rawRecords, win.workdayDates, settings.timezone);
  const totals = aggregateSummary(
    win.workdayDates,
    records,
    settings.dailyRequiredMinutes,
    settings.timezone
  );

  return { ...win, ...totals };
}

// ── Public service functions ──────────────────────────────────────────────────

/**
 * Returns the week summary for the current week in the user's timezone.
 * Throws PREVIOUS_RECORD_STILL_OPEN if a prior-day record is still open.
 */
export async function getWeekSummary(telegramId: string): Promise<WorkSummary> {
  const { startDate, endDate, workdaysCount, requiredMinutes, workedMinutes, balanceMinutes } =
    await buildSummary(telegramId, getWeekWindow);
  return { period: "week", startDate, endDate, workdaysCount, requiredMinutes, workedMinutes, balanceMinutes };
}

/**
 * Returns the month summary for the current month in the user's timezone.
 * Throws PREVIOUS_RECORD_STILL_OPEN if a prior-day record is still open.
 */
export async function getMonthSummary(telegramId: string): Promise<WorkSummary> {
  const { month, workdaysCount, requiredMinutes, workedMinutes, balanceMinutes } =
    await buildSummary(telegramId, getMonthWindow);
  return { period: "month", month, workdaysCount, requiredMinutes, workedMinutes, balanceMinutes };
}
