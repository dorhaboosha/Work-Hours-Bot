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
import { getLocalDate, utcToLocalDate, manualEndTimeToUtc } from "@/utils/DateUtils";
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

  // Check for any open (unfinished) record
  const openRecord = await findOpenRecord(telegramId);
  if (openRecord !== null) {
    const openDateStr = utcToLocalDate(openRecord.workDate, settings.timezone);
    if (openDateStr !== todayStr) {
      // Open record is from a previous local date — user must close it first
      throw new AppError(
        "PREVIOUS_RECORD_STILL_OPEN",
        `You have an unfinished workday from ${openDateStr}. Close it with /end HH:mm before starting a new one.`
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

  return createDailyRecord({ telegramId, workDate: todayDate, startTime, expectedEndTime });
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
        `You have an unfinished workday from ${openDateStr}. Close it with /end HH:mm.`
      );
    }

    // Active record is for today — compute live metrics
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
    "No active workday found. Use /start to begin your day."
  );
}

/**
 * Closes the user's active workday.
 *
 * Two branches:
 * - Today's record  → close with the current UTC time (no manualEndTime needed).
 * - Previous-day record → manualEndTime (HH:mm) is required; it is applied to
 *   the record's original workDate in the user's timezone and converted to UTC.
 *   The current date/time is NEVER used for previous-day records.
 *
 * Throws:
 * - USER_SETTINGS_NOT_FOUND      – no settings.
 * - DAILY_RECORD_ALREADY_CLOSED  – today's record exists but is already closed.
 * - ACTIVE_RECORD_NOT_FOUND      – no open record and no closed record for today.
 * - MANUAL_END_TIME_REQUIRED     – open record is from a prior date but no time given.
 */
export async function endWorkday(
  telegramId: string,
  manualEndTime?: string
): Promise<EndWorkdayResult> {
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
      "No active workday to end. Use /start to begin your day."
    );
  }

  const openDateStr = utcToLocalDate(openRecord.workDate, settings.timezone);
  const isPreviousDay = openDateStr !== todayStr;

  let endTime: Date;

  if (isPreviousDay) {
    // Previous-day branch: manualEndTime is mandatory
    if (!manualEndTime) {
      throw new AppError(
        "MANUAL_END_TIME_REQUIRED",
        `Your open workday is from ${openDateStr}. Provide an end time with /end HH:mm.`
      );
    }
    // Apply the given HH:mm to the record's original workDate in the user's timezone
    endTime = manualEndTimeToUtc(openDateStr, manualEndTime, settings.timezone);
  } else {
    // Today's branch: use the current UTC instant
    endTime = new Date();
  }

  const workedMinutes = calcWorkedMinutes(openRecord.startTime, endTime);
  const balanceMinutes = calcBalance(workedMinutes, settings.dailyRequiredMinutes);

  const updated = await updateDailyRecord(openRecord.id, { endTime, workedMinutes });

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
