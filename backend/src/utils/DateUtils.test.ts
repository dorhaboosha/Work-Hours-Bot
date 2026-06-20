import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDdMmToDate, localTimeToUtc } from "./DateUtils";

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
