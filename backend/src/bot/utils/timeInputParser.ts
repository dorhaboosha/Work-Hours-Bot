import type { Weekday } from "@shared/types/CoreTypes";

/**
 * Parses a comma-separated list of weekday numbers (0–6) entered by the user.
 * Returns a typed Weekday array on success, or null if the input is invalid.
 */
export function parseWorkdayList(raw: string): Weekday[] | null {
  const parts = raw.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length === 0) return null;
  if (parts.some((n) => isNaN(n) || n < 0 || n > 6)) return null;
  return parts as Weekday[];
}

/**
 * Strictly parses a numeric string (used for accrual rates, leave balances,
 * and debit amounts). Unlike `parseFloat`, which silently accepts trailing
 * garbage (e.g. `parseFloat("1.5days") === 1.5`), this rejects anything that
 * isn't a clean, fully-numeric, finite value. Returns null for empty input,
 * partial matches, or non-finite values (NaN/Infinity).
 */
export function parseStrictNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

// Re-exported from constants so flows have a single import point for all
// time/date input parsing needs.
export { HH_MM_RE, HH_MM_RANGE_RE, DD_MM_RE } from "@/constants/timeFormats";
