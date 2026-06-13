import type { Weekday } from "../types/CoreTypes";

/**
 * Converts decimal hours to whole minutes using rounding.
 * Example: 8.8 → 528 (8h 48m)
 */
export function decimalHoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

/**
 * Returns true when `day` is included in the user's configured workdays.
 */
export function isWorkday(day: Weekday, workdays: Weekday[]): boolean {
  return workdays.includes(day);
}
