import { prisma } from "@/config/PrismaClient";
import {
  createDailyRecord,
  findOpenWorkRecord,
  findRecordByDate,
  updateDailyRecord,
  listRecordsByRange,
} from "@/repositories/DailyRecordRepository";
import {
  createWorkPeriod,
  listWorkPeriods,
  updateWorkPeriod,
} from "@/repositories/WorkPeriodRepository";
import type { DailyRecord, UserSettings } from "@/generated/prisma/client";
import { getSettingsOrThrow } from "@/services/SettingsService";
import {
  calcExpectedEndTime,
  calcPeriodsWorkedMinutes,
  calcRemainingMinutes,
  calcBalance,
} from "@/services/TimeCalculationService";
import {
  getLocalDate,
  utcToLocalDate,
  resolveDdMmToDate,
  localDateToUtcMidnight,
} from "@/utils/DateUtils";
import { AppError } from "@/utils/AppError";
import type {
  WorkdayStatus,
  EndWorkdayResult,
  DateRecordLookup,
  WorkPeriodView,
} from "@shared/types/ViewTypes";
import type { DailyRecordType, RecordLookupState } from "@shared/types/CoreTypes";
import { canLogHours } from "@shared/utils/recordTypeUtils";
import { requiredMinutesFor } from "@/utils/requiredMinutes";
import { MAX_WORK_PERIODS_PER_DAY } from "@/constants/workPeriods";
import { toWorkPeriodViews } from "@/utils/workPeriodViews";

/** Returned by startWorkday: the day's record plus all of its periods. */
export interface StartWorkdayResult {
  record: DailyRecord;
  /** Today's periods in start order; the last one is the period just opened. */
  periods: WorkPeriodView[];
  /** Minutes already worked today in earlier (closed) periods. */
  workedMinutesSoFar: number;
}

/**
 * Starts a work period today for the given user.
 *
 * - No record today → creates today's WORK record with period 1.
 * - Today already has hours (all periods closed), or is a half-day absence
 *   (e.g. ½ vacation, or a holiday eve whose other half is worked) → opens
 *   another period on the same record. Its absence, credit and debit are
 *   kept, and expectedEndTime only covers what is still missing:
 *   required − credited − already worked.
 *
 * Guards (checked in order):
 * - PREVIOUS_RECORD_STILL_OPEN  – an open record exists from a prior local date.
 * - DAILY_RECORD_ALREADY_EXISTS – a period is already open today (including one
 *                                  opened by a concurrent /start).
 * - DAY_MARKED_AS_ABSENCE       – today is a full-day absence (no hours can be
 *                                  logged on it). details.recordType holds the type.
 * - WORK_PERIOD_LIMIT_REACHED   – today already has MAX_WORK_PERIODS_PER_DAY
 *                                  periods. details.max holds the limit.
 * - USER_SETTINGS_NOT_FOUND     – no settings found (from getSettingsOrThrow).
 *
 * `settings` may be passed in when the caller has already loaded it (e.g. a
 * bot handler that needs it for the reply text too), to avoid fetching twice.
 */
export async function startWorkday(
  telegramId: string,
  settings?: UserSettings
): Promise<StartWorkdayResult> {
  const resolvedSettings = settings ?? (await getSettingsOrThrow(telegramId));

  const todayStr = getLocalDate(resolvedSettings.timezone);
  const todayDate = localDateToUtcMidnight(todayStr);
  const requiredMinutes = requiredMinutesFor(resolvedSettings, todayStr);

  // These two reads are independent — run them concurrently rather than
  // only issuing the second after the first comes back null.
  const [openRecord, existingToday] = await Promise.all([
    findOpenWorkRecord(telegramId),
    findRecordByDate(telegramId, todayDate),
  ]);

  if (openRecord !== null) {
    const openDateStr = utcToLocalDate(openRecord.workDate, resolvedSettings.timezone);
    if (openDateStr !== todayStr) {
      // Open record is from a previous local date — user must fix it via /edit dd-mm
      throw new AppError(
        "PREVIOUS_RECORD_STILL_OPEN",
        `You have an unfinished workday from ${openDateStr}. Use /edit ${openDateStr} to close it before starting a new one.`
      );
    }
    // A period is already open today
    throw new AppError(
      "DAILY_RECORD_ALREADY_EXISTS",
      "You have already started today's workday."
    );
  }

  const startTime = new Date();

  if (existingToday === null) {
    const expectedEndTime = calcExpectedEndTime(startTime, requiredMinutes);
    const { record, period } = await prisma
      .$transaction(async (tx) => {
        const record = await createDailyRecord(
          { telegramId, workDate: todayDate, recordType: "WORK", startTime, expectedEndTime },
          tx
        );
        const period = await createWorkPeriod({ dailyRecordId: record.id, startTime }, tx);
        return { record, period };
      })
      .catch(rethrowConcurrentStart);
    return { record, periods: toWorkPeriodViews([period], startTime), workedMinutesSoFar: 0 };
  }

  if (!canLogHours(existingToday)) {
    throw new AppError(
      "DAY_MARKED_AS_ABSENCE",
      "Today is marked as a full-day absence.",
      { recordType: existingToday.recordType }
    );
  }

  const earlierPeriods = await listWorkPeriods(existingToday.id);
  if (earlierPeriods.length >= MAX_WORK_PERIODS_PER_DAY) {
    throw new AppError(
      "WORK_PERIOD_LIMIT_REACHED",
      `Today already has ${MAX_WORK_PERIODS_PER_DAY} work periods.`,
      { max: MAX_WORK_PERIODS_PER_DAY }
    );
  }

  // All earlier periods are closed (an open one was rejected above), so the
  // record's workedMinutes is their total.
  const workedMinutesSoFar = existingToday.workedMinutes ?? 0;
  const remainingRequired = Math.max(
    0,
    requiredMinutes - existingToday.creditedMinutes - workedMinutesSoFar
  );

  const { record, period } = await prisma
    .$transaction(async (tx) => {
      const record = await updateDailyRecord(
        existingToday.id,
        {
          // The record keeps the day's first start; endTime is cleared while
          // the new period is open.
          startTime: existingToday.startTime ?? startTime,
          endTime: null,
          expectedEndTime: calcExpectedEndTime(startTime, remainingRequired),
        },
        tx
      );
      const period = await createWorkPeriod({ dailyRecordId: existingToday.id, startTime }, tx);
      return { record, period };
    })
    .catch(rethrowConcurrentStart);

  return {
    record,
    periods: toWorkPeriodViews([...earlierPeriods, period], startTime),
    workedMinutesSoFar,
  };
}

/**
 * Turns a unique-constraint violation (Prisma P2002) raised by startWorkday's
 * write into DAILY_RECORD_ALREADY_EXISTS. It means a concurrent /start won the
 * race — it created today's record first (unique telegramId + workDate) or
 * opened a period first (at most one open period per record, a partial unique
 * index in the migrations) — and this transaction rolled back. Anything else
 * is rethrown unchanged.
 */
function rethrowConcurrentStart(err: unknown): never {
  if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002") {
    throw new AppError("DAILY_RECORD_ALREADY_EXISTS", "You have already started today's workday.");
  }
  throw err;
}

/**
 * Returns today's live workday status for the given user.
 *
 * Guards:
 * - PREVIOUS_RECORD_STILL_OPEN – open record exists from a prior local date.
 * - ACTIVE_RECORD_NOT_FOUND    – no open record for today.
 */
export async function getTodayStatus(
  telegramId: string,
  settings?: UserSettings
): Promise<WorkdayStatus> {
  const resolvedSettings = settings ?? (await getSettingsOrThrow(telegramId));
  const todayStr = getLocalDate(resolvedSettings.timezone);

  const openRecord = await findOpenWorkRecord(telegramId);

  if (openRecord !== null) {
    const openDateStr = utcToLocalDate(openRecord.workDate, resolvedSettings.timezone);
    if (openDateStr !== todayStr) {
      throw new AppError(
        "PREVIOUS_RECORD_STILL_OPEN",
        `You have an unfinished workday from ${openDateStr}. Use /edit ${openDateStr} to close it.`
      );
    }

    // Active record is for today — compute live metrics.
    // Open WORK records always have startTime/expectedEndTime; guard defensively.
    if (!openRecord.startTime || !openRecord.expectedEndTime) {
      throw new AppError("ACTIVE_RECORD_NOT_FOUND", "Open record is missing time data.");
    }
    const periods = await listWorkPeriods(openRecord.id);
    const now = new Date();
    const workedMinutesSoFar = calcPeriodsWorkedMinutes(periods, now);
    // Non-zero only when the open session is on a half-day absence record.
    const creditedMinutes = openRecord.creditedMinutes;
    const requiredMinutes = requiredMinutesFor(resolvedSettings, openDateStr);
    const remainingMinutes = calcRemainingMinutes(
      workedMinutesSoFar + creditedMinutes,
      requiredMinutes
    );

    return {
      workDate: openDateStr,
      startTime: openRecord.startTime.toISOString(),
      expectedEndTime: openRecord.expectedEndTime.toISOString(),
      periods: toWorkPeriodViews(periods, now),
      workedMinutesSoFar,
      creditedMinutes,
      requiredMinutes,
      remainingMinutes,
      isActive: true,
    };
  }

  throw new AppError(
    "ACTIVE_RECORD_NOT_FOUND",
    "No active workday found. Use /start to begin your day or /edit dd-mm to log a past date."
  );
}

/**
 * Closes today's open work period using the current time. The record's
 * workedMinutes becomes the total of all of today's periods.
 * V1.1 does not support `/end HH:mm`; previous-day open records must be
 * handled via the `/edit dd-mm` flow.
 *
 * Throws:
 * - USER_SETTINGS_NOT_FOUND       – no settings.
 * - PREVIOUS_RECORD_STILL_OPEN    – open record exists from a prior local date.
 * - DAILY_RECORD_ALREADY_CLOSED   – today's record exists but is already closed.
 *                                    details.canStartAnotherPeriod says whether
 *                                    /start could still open another period.
 * - ACTIVE_RECORD_NOT_FOUND       – no open record and no closed record for today.
 */
export async function endWorkday(
  telegramId: string,
  settings?: UserSettings
): Promise<EndWorkdayResult> {
  const resolvedSettings = settings ?? (await getSettingsOrThrow(telegramId));
  const todayStr = getLocalDate(resolvedSettings.timezone);
  const todayDate = localDateToUtcMidnight(todayStr);

  // Independent reads — run concurrently. closedToday is only needed when
  // openRecord turns out to be null, but issuing both up front saves a
  // round trip in the common case where openRecord is what we need.
  const [openRecord, closedToday] = await Promise.all([
    findOpenWorkRecord(telegramId),
    findRecordByDate(telegramId, todayDate),
  ]);
  if (openRecord === null) {
    // No open record — check whether today already has a closed one
    if (closedToday !== null) {
      // Lets the reply only suggest /start when it would actually work: not
      // on a full-day absence, and not once the period limit is reached.
      const canStartAnotherPeriod =
        canLogHours(closedToday) &&
        (await listWorkPeriods(closedToday.id)).length < MAX_WORK_PERIODS_PER_DAY;
      throw new AppError(
        "DAILY_RECORD_ALREADY_CLOSED",
        "Today's workday is already closed.",
        { canStartAnotherPeriod }
      );
    }
    throw new AppError(
      "ACTIVE_RECORD_NOT_FOUND",
      "No active workday to end. Use /start to begin your day or /edit dd-mm to fix a past date."
    );
  }

  const openDateStr = utcToLocalDate(openRecord.workDate, resolvedSettings.timezone);
  if (openDateStr !== todayStr) {
    // Open record is from a previous date — direct user to /edit dd-mm
    throw new AppError(
      "PREVIOUS_RECORD_STILL_OPEN",
      `You have an unfinished workday from ${openDateStr}. Use /edit ${openDateStr} to close it.`
    );
  }

  const periods = await listWorkPeriods(openRecord.id);
  const openPeriod = periods.find((p) => p.endTime === null);
  // An open record always has an open period; guard defensively.
  if (!openPeriod) {
    throw new AppError("ACTIVE_RECORD_NOT_FOUND", "Open record has no open work period.");
  }
  const endTime = new Date();
  const closedPeriods = periods.map((p) => (p.id === openPeriod.id ? { ...p, endTime } : p));
  const workedMinutes = calcPeriodsWorkedMinutes(closedPeriods, endTime);
  const creditedMinutes = openRecord.creditedMinutes;
  const requiredMinutes = requiredMinutesFor(resolvedSettings, openDateStr);
  const balanceMinutes = calcBalance(workedMinutes + creditedMinutes, requiredMinutes);

  const updated = await prisma.$transaction(async (tx) => {
    await updateWorkPeriod(openPeriod.id, { endTime }, tx);
    return updateDailyRecord(openRecord.id, { endTime, workedMinutes }, tx);
  });

  if (!updated.startTime || !updated.expectedEndTime) {
    throw new AppError("ACTIVE_RECORD_NOT_FOUND", "Updated record is missing time data.");
  }
  return {
    id: updated.id,
    telegramId: updated.telegramId,
    workDate: openDateStr,
    startTime: updated.startTime.toISOString(),
    expectedEndTime: updated.expectedEndTime.toISOString(),
    endTime: endTime.toISOString(),
    periods: toWorkPeriodViews(closedPeriods, endTime),
    workedMinutes,
    creditedMinutes,
    requiredMinutes,
    balanceMinutes,
  };
}

/**
 * Read-only lookup for a specific date via `/record dd-mm`.
 * Resolves `ddMm` to the current year in the user's timezone, loads the record
 * (if any), and classifies it as one of:
 *   COMPLETED_WORK_RECORD | OPEN_WORK_RECORD | ABSENCE_RECORD | NO_RECORD
 *
 * Never creates, updates, or deletes any record.
 *
 * Throws:
 * - USER_SETTINGS_NOT_FOUND – no settings found for the user.
 */
export async function getDateRecord(
  telegramId: string,
  ddMm: string,
  settings?: UserSettings
): Promise<DateRecordLookup> {
  const resolvedSettings = settings ?? (await getSettingsOrThrow(telegramId));
  const workDateStr = resolveDdMmToDate(ddMm, resolvedSettings.timezone);
  const workDate = localDateToUtcMidnight(workDateStr);

  const found = await findRecordByDate(telegramId, workDate);
  const base = { workDate: workDateStr, displayDate: ddMm, timezone: resolvedSettings.timezone };

  if (found === null) {
    return { ...base, periods: [], state: "NO_RECORD", record: null };
  }

  // Only records with logged hours have periods (full-day absences and half
  // days without hours have no startTime) — skip the query for the rest.
  const periods =
    found.startTime !== null
      ? toWorkPeriodViews(await listWorkPeriods(found.id), new Date())
      : [];

  const record = {
    id: found.id,
    telegramId: found.telegramId,
    workDate: workDateStr,
    recordType: found.recordType as DailyRecordType,
    absencePortion: found.absencePortion,
    startTime: found.startTime?.toISOString() ?? null,
    expectedEndTime: found.expectedEndTime?.toISOString() ?? null,
    endTime: found.endTime?.toISOString() ?? null,
    workedMinutes: found.workedMinutes ?? null,
    creditedMinutes: found.creditedMinutes,
    createdAt: found.createdAt.toISOString(),
    updatedAt: found.updatedAt.toISOString(),
  };

  return { ...base, periods, state: resolveRecordLookupState(found), record };
}

function resolveRecordLookupState(
  record: DailyRecord
): Exclude<RecordLookupState, "NO_RECORD"> {
  if (record.recordType === "WORK") {
    return record.endTime === null ? "OPEN_WORK_RECORD" : "COMPLETED_WORK_RECORD";
  }
  return "ABSENCE_RECORD";
}

/**
 * Lists daily records for a user, optionally filtered to a date window.
 * `from` and `to` are YYYY-MM-DD strings in the user's local timezone.
 * Verifies settings exist before querying (throws USER_SETTINGS_NOT_FOUND).
 */
export async function listWorkdays(
  telegramId: string,
  from?: string,
  to?: string
): Promise<DailyRecord[]> {
  await getSettingsOrThrow(telegramId);

  const fromDate = from !== undefined
    ? localDateToUtcMidnight(from)
    : undefined;
  const toDate = to !== undefined
    ? localDateToUtcMidnight(to)
    : undefined;

  return listRecordsByRange(telegramId, fromDate, toDate);
}
