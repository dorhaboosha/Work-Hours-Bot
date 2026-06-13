import type { DailyRecord } from "@/generated/prisma/client";
import {
  createDailyRecord,
  findOpenRecord,
  findRecordByDate,
} from "@/repositories/DailyRecordRepository";
import { getSettingsOrThrow } from "@/services/SettingsService";
import {
  calcExpectedEndTime,
  calcWorkedMinutesSoFar,
  calcRemainingMinutes,
} from "@/services/TimeCalculationService";
import { getLocalDate, utcToLocalDate } from "@/utils/DateUtils";
import { AppError } from "@/utils/AppError";
import { DateTime } from "luxon";
import type { WorkdayStatus } from "@shared/types/ViewTypes";

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
