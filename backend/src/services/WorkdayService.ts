import {
  createDailyRecord,
  findOpenRecord,
  findRecordByDate,
  updateDailyRecord,
  listRecordsByRange,
} from "@/repositories/DailyRecordRepository";
import type { DailyRecord } from "@/generated/prisma/client";
import { getSettingsOrThrow } from "@/services/SettingsService";
import {
  calcExpectedEndTime,
  calcWorkedMinutes,
  calcWorkedMinutesSoFar,
  calcRemainingMinutes,
  calcBalance,
} from "@/services/TimeCalculationService";
import { getLocalDate, utcToLocalDate } from "@/utils/DateUtils";
import { AppError } from "@/utils/AppError";
import { DateTime } from "luxon";
import type { WorkdayStatus, EndWorkdayResult } from "@shared/types/ViewTypes";

/**
 * Converts a local YYYY-MM-DD date string to a UTC midnight Date so it can be
 * stored in the Prisma `@db.Date` column without timezone shift.
 */
function localDateStringToUtcMidnight(dateStr: string): Date {
  return DateTime.fromISO(dateStr, { zone: "utc" }).toJSDate();
}

/**
 * Starts today's workday for the given user.
 *
 * Guards (checked in order):
 * - PREVIOUS_RECORD_STILL_OPEN  – an open record exists from a prior local date.
 * - DAILY_RECORD_ALREADY_EXISTS – a record (open or closed) already exists for
 *                                  today's local date.
 * - USER_SETTINGS_NOT_FOUND     – no settings found (from getSettingsOrThrow).
 */
export async function startWorkday(telegramId: string): Promise<DailyRecord> {
  const settings = await getSettingsOrThrow(telegramId);

  const todayStr = getLocalDate(settings.timezone);
  const todayDate = localDateStringToUtcMidnight(todayStr);

  // Check for any open (unfinished) WORK record
  const openRecord = await findOpenRecord(telegramId);
  if (openRecord !== null) {
    const openDateStr = utcToLocalDate(openRecord.workDate, settings.timezone);
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

  // Also guard against a closed record for today (duplicate date)
  const existingToday = await findRecordByDate(telegramId, todayDate);
  if (existingToday !== null) {
    throw new AppError(
      "DAILY_RECORD_ALREADY_EXISTS",
      "A record for today already exists."
    );
  }

  const startTime = new Date();
  const expectedEndTime = calcExpectedEndTime(
    startTime,
    settings.dailyRequiredMinutes
  );

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
  telegramId: string
): Promise<WorkdayStatus> {
  const settings = await getSettingsOrThrow(telegramId);
  const todayStr = getLocalDate(settings.timezone);

  const openRecord = await findOpenRecord(telegramId);

  if (openRecord !== null) {
    const openDateStr = utcToLocalDate(openRecord.workDate, settings.timezone);
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
    const remainingMinutes = calcRemainingMinutes(
      workedMinutesSoFar,
      settings.dailyRequiredMinutes
    );

    return {
      workDate: openDateStr,
      startTime: openRecord.startTime.toISOString(),
      expectedEndTime: openRecord.expectedEndTime.toISOString(),
      workedMinutesSoFar,
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
export async function endWorkday(telegramId: string): Promise<EndWorkdayResult> {
  const settings = await getSettingsOrThrow(telegramId);
  const todayStr = getLocalDate(settings.timezone);
  const todayDate = localDateStringToUtcMidnight(todayStr);

  const openRecord = await findOpenRecord(telegramId);
  if (openRecord === null) {
    // No open record — check whether today already has a closed one
    const closedToday = await findRecordByDate(telegramId, todayDate);
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

  const openDateStr = utcToLocalDate(openRecord.workDate, settings.timezone);
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
  const balanceMinutes = calcBalance(workedMinutes, settings.dailyRequiredMinutes);

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
    requiredMinutes: settings.dailyRequiredMinutes,
    balanceMinutes,
  };
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
    ? localDateStringToUtcMidnight(from)
    : undefined;
  const toDate = to !== undefined
    ? localDateStringToUtcMidnight(to)
    : undefined;

  return listRecordsByRange(telegramId, fromDate, toDate);
}
