import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { computeLeaveAccrualCatchUp } from "./accrualUtils";
import type { AccrualSettingsInput } from "./accrualUtils";

const TIMEZONE = "UTC";

function baseSettings(overrides: Partial<AccrualSettingsInput> = {}): AccrualSettingsInput {
  return {
    timezone: TIMEZONE,
    createdAt: new Date("2026-01-15T00:00:00.000Z"),
    accrualAnchorAt: null,
    accrualAppliedThrough: null,
    vacationAccrualRate: 1,
    sickAccrualRate: 1.5,
    ...overrides,
  };
}

describe("computeLeaveAccrualCatchUp", () => {
  describe("first touch (accrualAnchorAt still null)", () => {
    it("anchors to createdAt and owes nothing when createdAt is in the current month", () => {
      const settings = baseSettings({ createdAt: new Date("2026-06-10T00:00:00.000Z") });
      const now = DateTime.fromISO("2026-06-20T00:00:00.000Z", { zone: "utc" });

      const result = computeLeaveAccrualCatchUp(settings, now);

      assert.equal(result.vacationDelta, 0);
      assert.equal(result.sickDelta, 0);
      assert.equal(result.changed, true); // anchor must still be persisted
      assert.equal(result.accrualAnchorAt.toISOString(), "2026-06-10T00:00:00.000Z");
      assert.equal(result.accrualAppliedThrough.toISOString(), "2026-06-01T00:00:00.000Z");
    });

    it("back-accrues retroactively to createdAt in a single call", () => {
      // createdAt Jan 15 -> accrual anchor month = Jan. By June 20th, 5 month
      // boundaries have passed (Feb 1, Mar 1, Apr 1, May 1, Jun 1).
      const settings = baseSettings({ createdAt: new Date("2026-01-15T00:00:00.000Z") });
      const now = DateTime.fromISO("2026-06-20T00:00:00.000Z", { zone: "utc" });

      const result = computeLeaveAccrualCatchUp(settings, now);

      assert.equal(result.vacationDelta, 5); // 1/month * 5
      assert.equal(result.sickDelta, 7.5); // 1.5/month * 5
      assert.equal(result.changed, true);
      assert.equal(result.accrualAppliedThrough.toISOString(), "2026-06-01T00:00:00.000Z");
    });

    it("treats a null accrualAppliedThrough with a non-null anchor as first touch too (defensive)", () => {
      const settings = baseSettings({
        createdAt: new Date("2026-01-15T00:00:00.000Z"),
        accrualAnchorAt: new Date("2026-03-01T00:00:00.000Z"),
        accrualAppliedThrough: null,
      });
      const now = DateTime.fromISO("2026-03-15T00:00:00.000Z", { zone: "utc" });

      const result = computeLeaveAccrualCatchUp(settings, now);

      // Falls back to createdAt-based anchoring, not the stray accrualAnchorAt.
      assert.equal(result.accrualAnchorAt.toISOString(), "2026-01-15T00:00:00.000Z");
    });
  });

  describe("already-initialized: same-month re-touch is a no-op", () => {
    it("returns zero deltas and changed:false when the current month was already applied", () => {
      const settings = baseSettings({
        accrualAnchorAt: new Date("2026-01-15T00:00:00.000Z"),
        accrualAppliedThrough: new Date("2026-06-01T00:00:00.000Z"),
      });
      const now = DateTime.fromISO("2026-06-25T00:00:00.000Z", { zone: "utc" });

      const result = computeLeaveAccrualCatchUp(settings, now);

      assert.equal(result.vacationDelta, 0);
      assert.equal(result.sickDelta, 0);
      assert.equal(result.changed, false);
      assert.equal(result.accrualAppliedThrough.toISOString(), "2026-06-01T00:00:00.000Z");
    });
  });

  describe("already-initialized: single-month crossing", () => {
    it("credits exactly one month when now is the next calendar month", () => {
      const settings = baseSettings({
        accrualAnchorAt: new Date("2026-05-01T00:00:00.000Z"),
        accrualAppliedThrough: new Date("2026-05-01T00:00:00.000Z"),
        vacationAccrualRate: 1,
        sickAccrualRate: 1.5,
      });
      const now = DateTime.fromISO("2026-06-01T00:00:00.000Z", { zone: "utc" });

      const result = computeLeaveAccrualCatchUp(settings, now);

      assert.equal(result.vacationDelta, 1);
      assert.equal(result.sickDelta, 1.5);
      assert.equal(result.changed, true);
      assert.equal(result.accrualAppliedThrough.toISOString(), "2026-06-01T00:00:00.000Z");
    });
  });

  describe("already-initialized: multi-year gap", () => {
    it("credits the entire elapsed gap in one shot, uncapped", () => {
      const settings = baseSettings({
        accrualAnchorAt: new Date("2023-01-01T00:00:00.000Z"),
        accrualAppliedThrough: new Date("2023-01-01T00:00:00.000Z"),
        vacationAccrualRate: 1,
        sickAccrualRate: 1.5,
      });
      const now = DateTime.fromISO("2026-01-01T00:00:00.000Z", { zone: "utc" }); // exactly 36 months later

      const result = computeLeaveAccrualCatchUp(settings, now);

      assert.equal(result.vacationDelta, 36);
      assert.equal(result.sickDelta, 54);
    });
  });

  describe("worked example from requirements: setup Aug 15", () => {
    it("yields 0 months as of Aug 20 (still setup month)", () => {
      const settings = baseSettings({ createdAt: new Date("2026-08-15T00:00:00.000Z") });
      const now = DateTime.fromISO("2026-08-20T00:00:00.000Z", { zone: "utc" });

      const result = computeLeaveAccrualCatchUp(settings, now);

      assert.equal(result.vacationDelta, 0);
    });

    it("yields 1 month accrued as of Sep 1", () => {
      const settings = baseSettings({ createdAt: new Date("2026-08-15T00:00:00.000Z") });
      const now = DateTime.fromISO("2026-09-01T00:00:00.000Z", { zone: "utc" });

      const result = computeLeaveAccrualCatchUp(settings, now);

      assert.equal(result.vacationDelta, 1);
      assert.equal(result.sickDelta, 1.5);
    });

    it("yields 2 months accrued as of Oct 1 (applied incrementally: Sep 1 touch, then Oct 1 touch)", () => {
      const afterSeptemberTouch = baseSettings({
        createdAt: new Date("2026-08-15T00:00:00.000Z"),
        accrualAnchorAt: new Date("2026-08-15T00:00:00.000Z"),
        accrualAppliedThrough: new Date("2026-09-01T00:00:00.000Z"),
      });
      const now = DateTime.fromISO("2026-10-01T00:00:00.000Z", { zone: "utc" });

      const result = computeLeaveAccrualCatchUp(afterSeptemberTouch, now);

      assert.equal(result.vacationDelta, 1); // one more month on top of the 1 already applied
    });

    it("yields 2 months accrued as of Oct 1 in a single lazy touch (no Sep 1 visit in between)", () => {
      const settings = baseSettings({ createdAt: new Date("2026-08-15T00:00:00.000Z") });
      const now = DateTime.fromISO("2026-10-01T00:00:00.000Z", { zone: "utc" });

      const result = computeLeaveAccrualCatchUp(settings, now);

      assert.equal(result.vacationDelta, 2);
      assert.equal(result.sickDelta, 3);
    });
  });

  describe("last-day-of-month setup edge case", () => {
    it("still yields exactly 1 month elapsed at the very start of the next month", () => {
      const settings = baseSettings({ createdAt: new Date("2026-08-31T23:00:00.000Z") });
      const now = DateTime.fromISO("2026-09-01T00:00:00.000Z", { zone: "utc" });

      const result = computeLeaveAccrualCatchUp(settings, now);

      assert.equal(result.vacationDelta, 1);
    });
  });

  describe("timezone correctness", () => {
    it("computes month boundaries in the user's timezone, not UTC", () => {
      // Asia/Jerusalem is UTC+3 in summer. 2026-08-31T22:30:00Z is already
      // 2026-09-01 01:30 local time, i.e. the next month has already begun locally.
      const settings = baseSettings({
        timezone: "Asia/Jerusalem",
        accrualAnchorAt: new Date("2026-08-01T00:00:00.000Z"),
        accrualAppliedThrough: new Date("2026-08-01T00:00:00.000Z"),
      });
      const now = DateTime.fromISO("2026-08-31T22:30:00.000Z", { zone: "utc" });

      const result = computeLeaveAccrualCatchUp(settings, now);

      assert.equal(result.vacationDelta, 1);
    });
  });

  describe("rounding", () => {
    it("rounds accrual deltas to 1 decimal place", () => {
      const settings = baseSettings({
        accrualAnchorAt: new Date("2026-01-01T00:00:00.000Z"),
        accrualAppliedThrough: new Date("2026-01-01T00:00:00.000Z"),
        vacationAccrualRate: 0.3,
        sickAccrualRate: 1.5,
      });
      const now = DateTime.fromISO("2026-04-01T00:00:00.000Z", { zone: "utc" }); // 3 months

      const result = computeLeaveAccrualCatchUp(settings, now);

      assert.equal(result.vacationDelta, 0.9);
      assert.equal(result.sickDelta, 4.5);
    });
  });
});
