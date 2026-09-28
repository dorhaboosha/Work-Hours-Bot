import {
  createDailyRecord,
  findOpenWorkRecord,
  findRecordByDate,
  updateDailyRecord,
  listRecordsByRange,
} from "@/repositories/DailyRecordRepository";
import type { DailyRecord, UserSettings } from "@/generated/prisma/client";
import { getSettingsOrThrow } from "@/services/SettingsService";
import {
  calcExpectedEndTime,
  calcWorkedMinutes,
  calcWorkedMinutesSoFar,
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
import type { WorkdayStatus, EndWorkdayResult, DateRecordLookup } from "@shared/types/ViewTypes";
import type { DailyRecordType, RecordLookupState } from "@shared/types/CoreTypes";
import { canLogHours } from "@shared/utils/recordTypeUtils";
import { requiredMinutesFor } from "@/utils/requiredMinutes";

/**
 * Starts today's workday for the given user.
 *
 * If today is already marked as a half-day absence (e.g. ½ vacation day, or a
 * holiday eve whose other half is worked) and no hours were logged on it yet,
 * the session starts on that record instead of creating a new one: its
 * absence, credit and debit are kept, and expectedEndTime only covers the
 * remaining (required − credited) minutes.
 *
 * Guards (checked in order):
 * - PREVIOUS_RECORD_STILL_OPEN  – an open record exists from a prior local date.
 * - DAILY_RECORD_ALREADY_EXISTS – today already has a session (open or closed),
 *                                  including a half day with hours logged.
 * - DAY_MARKED_AS_ABSENCE       – today is a full-day absence (no hours can be
 *                                  logged on it). details.recordType holds the type.
 * - USER_SETTINGS_NOT_FOUND     – no settings found (from getSettingsOrThrow).
 *
 * `settings` may be passed in when the caller has already loaded it (e.g. a
 * bot handler that needs it for the reply text too), to avoid fetching twice.
 */
export async function startWorkday(
  telegramId: string,
  settings?: UserSettings
): Promise<DailyRecord> {
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
    // Open record is for today — already started
    throw new AppError(
      "DAILY_RECORD_ALREADY_EXISTS",
      "You have already started today's workday."
    );
  }

  const startTime = new Date();

  if (existingToday !== null) {
    // Half-day absence with no hours logged yet → start the session on it.
    if (canLogHours(existingToday) && existingToday.startTime === null) {
      const remainingRequired = Math.max(0, requiredMinutes - existingToday.creditedMinutes);
      return updateDailyRecord(existingToday.id, {
        startTime,
        expectedEndTime: calcExpectedEndTime(startTime, remainingRequired),
      });
    }

    if (!canLogHours(existingToday)) {
      throw new AppError(
        "DAY_MARKED_AS_ABSENCE",
        "Today is marked as a full-day absence.",
        { recordType: existingToday.recordType }
      );
    }

    // A session already exists for today (closed WORK day, or a half day
    // with hours already logged).
    throw new AppError(
      "DAILY_RECORD_ALREADY_EXISTS",
      "A record for today already exists."
    );
  }

  const expectedEndTime = calcExpectedEndTime(startTime, requiredMinutes);

  return createDailyRecord({ telegramId, workDate: todayDate, recordType: "WORK", startTime, expectedEndTime });
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
    const workedMinutesSoFar = calcWorkedMinutesSoFar(openRecord.startTime);
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
 * Closes today's active WORK record using the current time.
 * V1.1 does not support `/end HH:mm`; previous-day open records must be
 * handled via the `/edit dd-mm` flow.
 *
 * Throws:
 * - USER_SETTINGS_NOT_FOUND       – no settings.
 * - PREVIOUS_RECORD_STILL_OPEN    – open record exists from a prior local date.
 * - DAILY_RECORD_ALREADY_CLOSED   – today's record exists but is already closed.
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
      throw new AppError(
        "DAILY_RECORD_ALREADY_CLOSED",
        "Today's workday is already closed."
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

  // Open WORK records always have startTime; guard defensively.
  if (!openRecord.startTime) {
    throw new AppError("ACTIVE_RECORD_NOT_FOUND", "Open record is missing start time.");
  }
  const endTime = new Date();
  const workedMinutes = calcWorkedMinutes(openRecord.startTime, endTime);
  const creditedMinutes = openRecord.creditedMinutes;
  const requiredMinutes = requiredMinutesFor(resolvedSettings, openDateStr);
  const balanceMinutes = calcBalance(workedMinutes + creditedMinutes, requiredMinutes);

  const updated = await updateDailyRecord(openRecord.id, { endTime, workedMinutes });

  if (!updated.startTime || !updated.expectedEndTime) {
    throw new AppError("ACTIVE_RECORD_NOT_FOUND", "Updated record is missing time data.");
  }
  return {
    id: updated.id,
    telegramId: updated.telegramId,
    workDate: openDateStr,
    startTime: updated.startTime.toISOString(),
    expectedEndTime: updated.expectedEndTime.toISOString(),
    endTime: updated.endTime!.toISOString(),
    workedMinutes: updated.workedMinutes!,
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

  const prisma = await findRecordByDate(telegramId, workDate);

  const state: RecordLookupState = resolveRecordLookupState(prisma);
  const base = { workDate: workDateStr, displayDate: ddMm, timezone: resolvedSettings.timezone };

  if (state === "NO_RECORD") {
    return { ...base, state, record: null };
  }

  const record = {
    id: prisma!.id,
    telegramId: prisma!.telegramId,
    workDate: workDateStr,
    recordType: prisma!.recordType as DailyRecordType,
    absencePortion: prisma!.absencePortion,
    startTime: prisma!.startTime?.toISOString() ?? null,
    expectedEndTime: prisma!.expectedEndTime?.toISOString() ?? null,
    endTime: prisma!.endTime?.toISOString() ?? null,
    workedMinutes: prisma!.workedMinutes ?? null,
    creditedMinutes: prisma!.creditedMinutes,
    createdAt: prisma!.createdAt.toISOString(),
    updatedAt: prisma!.updatedAt.toISOString(),
  };

  return { ...base, state, record };
}

function resolveRecordLookupState(
  record: Awaited<ReturnType<typeof findRecordByDate>>
): RecordLookupState {
  if (record === null) return "NO_RECORD";
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
