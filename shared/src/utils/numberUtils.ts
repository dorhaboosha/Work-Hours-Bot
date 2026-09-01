/**
 * Returns true when `n` is an exact multiple of 0.5 (e.g. 1, 1.5, -2.5, 0).
 * Used to validate leave-balance overrides and mark-absence debit amounts,
 * both of which must be entered in half-day increments.
 */
export function isMultipleOfHalf(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
}
