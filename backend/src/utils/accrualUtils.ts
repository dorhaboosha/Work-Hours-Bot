import { DateTime } from "luxon";

/**
 * The subset of UserSettings fields needed to compute leave accrual catch-up.
 */
export interface AccrualSettingsInput {
  timezone: string;
  /** When the user's account was created — used as the retroactive accrual anchor for pre-existing users. */
  createdAt: Date;
  /** null until the first accrual catch-up runs for this user. */
  accrualAnchorAt: Date | null;
  /** null until the first accrual catch-up runs for this user. */
  accrualAppliedThrough: Date | null;
  vacationAccrualRate: number;
  sickAccrualRate: number;
}

export interface AccrualCatchUpResult {
  /** The anchor to persist (unchanged from input unless this was the first touch). */
  accrualAnchorAt: Date;
  /** The new "applied through" marker to persist. */
  accrualAppliedThrough: Date;
  /** Vacation days to add to the balance. 0 when nothing is owed. */
  vacationDelta: number;
  sickDelta: number;
  /** True when the caller should persist this result (either a delta is owed, or the anchor was just initialized). */
  changed: boolean;
}

/** Rounds to 1 decimal place, guarding against floating-point drift from repeated increments. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Computes how much vacation/sick accrual is owed since it was last applied,
 * following calendar-month boundaries in the user's timezone.
 *
 * This codebase has no scheduler — accrual is applied lazily, i.e. this is
 * called whenever a balance is touched (see LeaveBalanceService). A "month of
 * work" is credited on the 1st of the next calendar month after the anchor,
 * not on a rolling 30-day/anniversary window.
 *
 * On the first call for a user (accrualAnchorAt/accrualAppliedThrough still
 * null — e.g. a pre-existing account after this feature ships), the anchor is
 * backdated to `createdAt` (their original /setup date) rather than "now", so
 * the full retroactive gap is credited in this one call.
 */
export function computeLeaveAccrualCatchUp(
  settings: AccrualSettingsInput,
  nowUtc: DateTime = DateTime.utc()
): AccrualCatchUpResult {
  const currentMonthStartLocal = nowUtc.setZone(settings.timezone).startOf("month");

  let anchorLocal: DateTime;
  let appliedThroughLocal: DateTime;
  const isFirstTouch =
    settings.accrualAnchorAt === null || settings.accrualAppliedThrough === null;

  if (isFirstTouch) {
    anchorLocal = DateTime.fromJSDate(settings.createdAt, { zone: "utc" }).setZone(
      settings.timezone
    );
    appliedThroughLocal = anchorLocal.startOf("month");
  } else {
    anchorLocal = DateTime.fromJSDate(settings.accrualAnchorAt as Date, {
      zone: "utc",
    }).setZone(settings.timezone);
    appliedThroughLocal = DateTime.fromJSDate(settings.accrualAppliedThrough as Date, {
      zone: "utc",
    })
      .setZone(settings.timezone)
      .startOf("month");
  }

  if (currentMonthStartLocal.toMillis() <= appliedThroughLocal.toMillis()) {
    return {
      accrualAnchorAt: anchorLocal.toUTC().toJSDate(),
      accrualAppliedThrough: appliedThroughLocal.toUTC().toJSDate(),
      vacationDelta: 0,
      sickDelta: 0,
      changed: isFirstTouch,
    };
  }

  const monthsElapsed = Math.round(
    currentMonthStartLocal.diff(appliedThroughLocal, "months").months
  );

  return {
    accrualAnchorAt: anchorLocal.toUTC().toJSDate(),
    accrualAppliedThrough: currentMonthStartLocal.toUTC().toJSDate(),
    vacationDelta: round1(settings.vacationAccrualRate * monthsElapsed),
    sickDelta: round1(settings.sickAccrualRate * monthsElapsed),
    changed: true,
  };
}
