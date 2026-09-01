import { DateTime } from "luxon";
import type { UserSettings } from "@/generated/prisma/client";
import {
  findUserSettingsByTelegramId,
  upsertUserSettings,
  updateUserSettings,
} from "@/repositories/UserSettingsRepository";
import type { UpdateUserSettingsData } from "@/repositories/UserSettingsRepository";
import { AppError } from "@/utils/AppError";
import { decimalHoursToMinutes } from "@shared/utils/timeUtils";
import type { Weekday } from "@shared/types/CoreTypes";

/** MVP default workdays: Sunday–Thursday */
export const DEFAULT_WORKDAYS: Weekday[] = [0, 1, 2, 3, 4];

/** MVP default timezone */
export const DEFAULT_TIMEZONE = "Asia/Jerusalem";

/** Default vacation days accrued per elapsed calendar month. */
export const DEFAULT_VACATION_ACCRUAL_RATE = 1;

/** Default sick days accrued per elapsed calendar month. */
export const DEFAULT_SICK_ACCRUAL_RATE = 1.5;

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
  /** Vacation days accrued per elapsed calendar month. Defaults to DEFAULT_VACATION_ACCRUAL_RATE. */
  vacationAccrualRate?: number;
  /** Sick days accrued per elapsed calendar month. Defaults to DEFAULT_SICK_ACCRUAL_RATE. */
  sickAccrualRate?: number;
}

/**
 * First-time setup only. Throws SETUP_ALREADY_COMPLETED if the user already
 * has settings — they should use /settings_edit to make changes.
 */
export async function setupSettings(
  input: SetupInput
): Promise<UserSettings> {
  const { telegramId, dailyHoursOrMinutes, timezone, workdays } = input;

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

  const vacationAccrualRate = input.vacationAccrualRate ?? DEFAULT_VACATION_ACCRUAL_RATE;
  const sickAccrualRate = input.sickAccrualRate ?? DEFAULT_SICK_ACCRUAL_RATE;

  // Initialize the leave-accrual clock at the moment setup completes: the
  // anchor is "now", and the first month is considered already-applied (accrual
  // only starts counting from the next calendar-month boundary in the user's
  // timezone — see accrualUtils.computeLeaveAccrualCatchUp).
  const now = DateTime.now().setZone(timezone);
  const accrualAnchorAt = now.toUTC().toJSDate();
  const accrualAppliedThrough = now.startOf("month").toUTC().toJSDate();

  return upsertUserSettings({
    telegramId,
    dailyRequiredMinutes,
    timezone,
    workdays,
    vacationAccrualRate,
    sickAccrualRate,
    accrualAnchorAt,
    accrualAppliedThrough,
  });
}

export interface UpdateSettingsInput {
  dailyRequiredMinutes?: number;
  timezone?: string;
  workdays?: Weekday[];
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
