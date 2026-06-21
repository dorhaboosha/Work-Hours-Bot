import type { UserSettings } from "@/generated/prisma/client";
import {
  findUserSettingsByTelegramId,
  upsertUserSettings,
  updateUserSettings,
} from "@/repositories/UserSettingsRepository";
import type { UpdateUserSettingsData } from "@/repositories/UserSettingsRepository";
import { AppError } from "@/utils/AppError";
import { decimalHoursToMinutes } from "@shared/utils/timeUtils";
import type { Weekday, LanguageCode } from "@shared/types/CoreTypes";

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
  timezone: string;
  workdays: Weekday[];
  language: LanguageCode;
}

/**
 * First-time setup only. Throws SETUP_ALREADY_COMPLETED if the user already
 * has settings — they should use /settings_edit to make changes.
 */
export async function setupSettings(
  input: SetupInput
): Promise<UserSettings> {
  const { telegramId, dailyHoursOrMinutes, timezone, workdays, language } = input;

  const existing = await findUserSettingsByTelegramId(telegramId);
  if (existing) {
    throw new AppError(
      "SETUP_ALREADY_COMPLETED",
      "You have already completed setup. Use /settings_edit to update your settings."
    );
  }

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
    language,
  });
}

export interface UpdateSettingsInput {
  dailyRequiredMinutes?: number;
  timezone?: string;
  workdays?: Weekday[];
  language?: LanguageCode;
}

/**
 * Partial update for /settings_edit. Throws USER_SETTINGS_NOT_FOUND when the
 * user has no settings yet — they should run /setup first.
 */
export async function updateSettings(
  telegramId: string,
  input: UpdateSettingsInput
): Promise<UserSettings> {
  await getSettingsOrThrow(telegramId);

  const data: UpdateUserSettingsData = {
    ...(input.dailyRequiredMinutes !== undefined && {
      dailyRequiredMinutes: input.dailyRequiredMinutes,
    }),
    ...(input.timezone !== undefined && { timezone: input.timezone }),
    ...(input.workdays !== undefined && { workdays: input.workdays }),
    ...(input.language !== undefined && { language: input.language }),
  };

  return updateUserSettings(telegramId, data);
}

/** Returns settings or null — use when absence is not an error. */
export async function getSettings(
  telegramId: string
): Promise<UserSettings | null> {
  return findUserSettingsByTelegramId(telegramId);
}

/**
 * Resolves the user's configured language without throwing.
 * Returns "en" when settings do not exist or the query fails.
 * Use this when you need the language early (e.g. for error formatting)
 * without requiring settings to exist.
 */
export async function resolveUserLang(telegramId: string): Promise<LanguageCode> {
  const settings = await findUserSettingsByTelegramId(telegramId).catch(() => null);
  return (settings?.language as LanguageCode) ?? "en";
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
