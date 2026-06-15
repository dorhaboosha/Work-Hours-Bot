import { utcToLocalTime } from "@/utils/DateUtils";
import {
  formatMinutesAsDuration,
  formatBalance,
} from "@shared/utils/formatUtils";

// Re-export shared helpers so handlers only need one import path
export { formatMinutesAsDuration, formatBalance };

/**
 * Converts a UTC ISO timestamp (or Date) to a local HH:mm string in the given
 * timezone. Used to display startTime, expectedEndTime, and endTime in messages.
 */
export function formatTime(utc: Date | string, timezone: string): string {
  return utcToLocalTime(utc, timezone);
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
