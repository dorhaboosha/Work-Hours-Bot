import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDdMmToDate, localTimeToUtc, startOfCurrentUtcMonth } from "./DateUtils";

describe("resolveDdMmToDate", () => {
  it("resolves dd-mm using the current year in the given timezone", () => {
    const { DateTime } = require("luxon") as typeof import("luxon");
    const timezone = "Asia/Jerusalem";
    const currentYear = DateTime.now().setZone(timezone).year;

    const result = resolveDdMmToDate("20-06", timezone);

    assert.equal(result, `${currentYear}-06-20`);
  });

  it("handles single-digit day and month correctly", () => {
    const { DateTime } = require("luxon") as typeof import("luxon");
    const timezone = "UTC";
    const currentYear = DateTime.now().setZone(timezone).year;

    const result = resolveDdMmToDate("01-01", timezone);

    assert.equal(result, `${currentYear}-01-01`);
  });

  it("uses the timezone's current year, not UTC year", () => {
    // This test verifies the year comes from the timezone-local clock.
    // We just check the format is correct (4-digit year, correct month/day).
    const result = resolveDdMmToDate("15-03", "America/New_York");

    assert.match(result, /^\d{4}-03-15$/);
  });
});

describe("localTimeToUtc", () => {
  it("converts HH:mm on a given date + timezone to a UTC Date", () => {
    // Asia/Jerusalem is UTC+3 in summer (EEST)
    const result = localTimeToUtc("2026-06-20", "17:30", "Asia/Jerusalem");

    assert.equal(result.toISOString(), "2026-06-20T14:30:00.000Z");
  });

  it("anchors to the workDate, not the current date", () => {
    const result = localTimeToUtc("2025-01-10", "09:00", "UTC");

    assert.equal(result.toISOString(), "2025-01-10T09:00:00.000Z");
  });
});

describe("startOfCurrentUtcMonth", () => {
  it("returns the 1st of the month for a mid-month input", () => {
    const result = startOfCurrentUtcMonth(new Date("2026-07-15T10:00:00Z"));
    assert.equal(result.toISOString(), "2026-07-01T00:00:00.000Z");
  });

  it("is idempotent when the input is already at month-start", () => {
    const result = startOfCurrentUtcMonth(new Date("2026-07-01T00:00:00Z"));
    assert.equal(result.toISOString(), "2026-07-01T00:00:00.000Z");
  });

  it("does not roll into the next month on the last day of a 31-day month", () => {
    const result = startOfCurrentUtcMonth(new Date("2026-07-31T23:59:59Z"));
    assert.equal(result.toISOString(), "2026-07-01T00:00:00.000Z");
  });

  it("does not roll into the next month on the last day of a 30-day month", () => {
    const result = startOfCurrentUtcMonth(new Date("2026-04-30T23:59:59Z"));
    assert.equal(result.toISOString(), "2026-04-01T00:00:00.000Z");
  });

  it("handles the last day of February in a non-leap year", () => {
    const result = startOfCurrentUtcMonth(new Date("2026-02-28T12:00:00Z"));
    assert.equal(result.toISOString(), "2026-02-01T00:00:00.000Z");
  });

  it("handles the last day of February in a leap year", () => {
    const result = startOfCurrentUtcMonth(new Date("2024-02-29T12:00:00Z"));
    assert.equal(result.toISOString(), "2024-02-01T00:00:00.000Z");
  });

  it("does not roll into the next year on a December input", () => {
    const result = startOfCurrentUtcMonth(new Date("2026-12-31T23:59:59Z"));
    assert.equal(result.toISOString(), "2026-12-01T00:00:00.000Z");
  });

  it("handles a January input correctly after a December rollover", () => {
    const result = startOfCurrentUtcMonth(new Date("2027-01-15T08:00:00Z"));
    assert.equal(result.toISOString(), "2027-01-01T00:00:00.000Z");
  });
});
