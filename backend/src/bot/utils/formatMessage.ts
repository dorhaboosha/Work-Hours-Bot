import { utcToLocalTime } from "@/utils/DateUtils";
import type { UserSettings } from "@/generated/prisma/client";
import type { Weekday } from "@shared/types/CoreTypes";
import { t, formatWorkdays } from "@/i18n";
import {
  formatMinutesAsDuration,
  formatBalance,
  formatDecimalDays,
} from "@shared/utils/formatUtils";

// Re-export shared helpers so handlers only need one import path
export { formatMinutesAsDuration, formatBalance, formatDecimalDays };

/**
 * Converts a UTC ISO timestamp (or Date) to a local HH:mm string in the given
 * timezone. Used to display startTime, expectedEndTime, and endTime in messages.
 */
export function formatTime(utc: Date | string, timezone: string): string {
  return utcToLocalTime(utc, timezone);
}

/** Renders the settings block shown by /settings, /settings_edit and /setup. */
export function formatSettingsDisplay(settings: UserSettings): string {
  return t("settings.display", {
    dailyHoursStr: formatMinutesAsDuration(settings.dailyRequiredMinutes),
    cholHamoedHoursStr:
      settings.cholHamoedRequiredMinutes === null
        ? t("settings.cholHamoedSameAsDaily")
        : formatMinutesAsDuration(settings.cholHamoedRequiredMinutes),
    workdaysStr: formatWorkdays(settings.workdays as Weekday[]),
    timezone: settings.timezone,
    vacationRateStr: formatDecimalDays(settings.vacationAccrualRate),
    sickRateStr: formatDecimalDays(settings.sickAccrualRate),
  });
}

/** Maps a leave balance field to its short display label for bot messages. */
export function formatLeaveFieldLabel(field: "vacationBalance" | "sickBalance"): string {
  return field === "vacationBalance" ? "vacation" : "sick";
}

/**
 * Builds a one-line summary line used in several bot replies.
 * Example: "🕐 09:00 → 17:48  |  ✅ 08:48 / 08:48  |  Balance: +00:00"
 */
export function formatWorkdayLine(opts: {
  startTime: Date | string;
  expectedEndTime: Date | string;
  workedMinutes: number;
  requiredMinutes: number;
  timezone: string;
}): string {
  const start = formatTime(opts.startTime, opts.timezone);
  const end = formatTime(opts.expectedEndTime, opts.timezone);
  const worked = formatMinutesAsDuration(opts.workedMinutes);
  const required = formatMinutesAsDuration(opts.requiredMinutes);
  const balance = formatBalance(opts.workedMinutes - opts.requiredMinutes);
  return `🕐 ${start} → ${end}  |  ✅ ${worked} / ${required}  |  Balance: ${balance}`;
}
