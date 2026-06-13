import type { UserSettings } from "@/generated/prisma/client";
import {
  findUserSettingsByTelegramId,
  upsertUserSettings,
} from "@/repositories/UserSettingsRepository";
import { AppError } from "@/utils/AppError";
import { decimalHoursToMinutes } from "@shared/utils/timeUtils";
import type { Weekday } from "@shared/types/CoreTypes";

/** MVP default workdays: Sunday–Thursday */
export const DEFAULT_WORKDAYS: Weekday[] = [0, 1, 2, 3, 4];

/** MVP default timezone */
export const DEFAULT_TIMEZONE = "Asia/Jerusalem";

export interface SetupInput {
  telegramId: string;
  /**
   * Accepts either decimal hours (e.g. 8.8) or whole minutes (e.g. 528).
   * Values >= 60 are treated as already-converted minutes; smaller values
   * are treated as decimal hours and converted via decimalHoursToMinutes.
   */
  dailyHoursOrMinutes: number;
  timezone?: string;
  workdays?: Weekday[];
}

export async function setupSettings(
  input: SetupInput
): Promise<UserSettings> {
  const {
    telegramId,
    dailyHoursOrMinutes,
    timezone = DEFAULT_TIMEZONE,
    workdays = DEFAULT_WORKDAYS,
  } = input;

  // Convert decimal hours to minutes when a fractional/small value is supplied.
  // If the value is already a reasonable minute count (>= 60) leave it as-is.
  const dailyRequiredMinutes =
    dailyHoursOrMinutes < 60
      ? decimalHoursToMinutes(dailyHoursOrMinutes)
      : Math.round(dailyHoursOrMinutes);

  return upsertUserSettings({
    telegramId,
    dailyRequiredMinutes,
    timezone,
    workdays,
  });
}

/** Returns settings or null — use when absence is not an error. */
export async function getSettings(
  telegramId: string
): Promise<UserSettings | null> {
  return findUserSettingsByTelegramId(telegramId);
}

/**
 * Returns settings or throws USER_SETTINGS_NOT_FOUND.
 * Use this in any flow that requires settings to exist before proceeding.
 */
export async function getSettingsOrThrow(
  telegramId: string
): Promise<UserSettings> {
  const settings = await findUserSettingsByTelegramId(telegramId);

  if (!settings) {
    throw new AppError(
      "USER_SETTINGS_NOT_FOUND",
      "User settings not found. Please run /setup first."
    );
  }

  return settings;
}
