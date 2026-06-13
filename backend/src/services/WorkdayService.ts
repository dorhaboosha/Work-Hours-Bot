import type { DailyRecord } from "@/generated/prisma/client";
import { createDailyRecord } from "@/repositories/DailyRecordRepository";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { calcExpectedEndTime } from "@/services/TimeCalculationService";
import { getLocalDate } from "@/utils/DateUtils";
import { DateTime } from "luxon";

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
 * Happy path:
 * 1. Load user settings (throws USER_SETTINGS_NOT_FOUND if absent).
 * 2. Determine today's local workDate from the user's timezone.
 * 3. Record startTime as the current UTC instant.
 * 4. Calculate expectedEndTime = startTime + dailyRequiredMinutes.
 * 5. Persist and return the new DailyRecord.
 *
 * Guards (DAILY_RECORD_ALREADY_EXISTS, PREVIOUS_RECORD_STILL_OPEN) are added
 * in task 6.5.
 */
export async function startWorkday(telegramId: string): Promise<DailyRecord> {
  const settings = await getSettingsOrThrow(telegramId);

  const workDateStr = getLocalDate(settings.timezone);
  const workDate = localDateStringToUtcMidnight(workDateStr);
  const startTime = new Date();
  const expectedEndTime = calcExpectedEndTime(
    startTime,
    settings.dailyRequiredMinutes
  );

  return createDailyRecord({ telegramId, workDate, startTime, expectedEndTime });
}
