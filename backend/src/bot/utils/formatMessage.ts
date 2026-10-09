import { utcToLocalTime } from "@/utils/DateUtils";
import type { UserSettings } from "@/generated/prisma/client";
import type { Weekday } from "@shared/types/CoreTypes";
import type { WorkPeriodView } from "@shared/types/ViewTypes";
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

/**
 * Renders a day's work periods as numbered lines, in order:
 * "1. *08:00–13:00* (05:00)" for a closed period, "2. *15:00–now* (01:10)"
 * for the open one.
 */
export function formatWorkPeriodsList(periods: WorkPeriodView[], timezone: string): string {
  return periods
    .map((p, i) =>
      t(p.endTime === null ? "workPeriods.openLine" : "workPeriods.closedLine", {
        periodNumber: i + 1,
        startStr: formatTime(p.startTime, timezone),
        endStr: p.endTime === null ? "" : formatTime(p.endTime, timezone),
        durationStr: formatMinutesAsDuration(p.workedMinutes),
      })
    )
    .join("\n");
}

/** The "🕐 Work periods:" header followed by the numbered period list. */
export function formatWorkPeriodsBlock(periods: WorkPeriodView[], timezone: string): string {
  return `${t("workPeriods.header")}\n${formatWorkPeriodsList(periods, timezone)}`;
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
