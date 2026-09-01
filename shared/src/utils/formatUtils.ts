/**
 * Formats a duration in minutes as HH:mm.
 * Handles negative values with a leading "-".
 * Examples: 570 → "09:30", 42 → "00:42", -80 → "-01:20"
 */
export function formatMinutesAsDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const absMinutes = Math.abs(minutes);

  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;

  return `${sign}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Formats a balance in minutes as a signed HH:mm string.
 * Positive values get a "+" prefix; zero and negative use formatMinutesAsDuration directly.
 * Examples: 42 → "+00:42", -80 → "-01:20", 0 → "00:00"
 */
export function formatBalance(minutes: number): string {
  const formatted = formatMinutesAsDuration(minutes);
  return minutes > 0 ? `+${formatted}` : formatted;
}

/**
 * Formats a day-count value (leave accrual rate or leave balance) as a plain
 * decimal string: whole numbers show no decimal, halves show exactly one
 * decimal place. Negative values keep their "-" sign; no unary "+" prefix
 * (unlike formatBalance) since these are plain counts, not deltas.
 * Examples: 1 -> "1", 1.5 -> "1.5", -2.5 -> "-2.5", 0 -> "0"
 */
export function formatDecimalDays(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
