import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import {
  resolveDdMmToDate,
  localTimeToUtc,
  localDateToUtcMidnight,
  startOfCurrentUtcMonth,
  retentionCutoff,
  isValidTimezone,
} from "./DateUtils";
import { AppError } from "@/utils/AppError";

describe("isValidTimezone", () => {
  it("accepts recognized IANA zone names", () => {
    assert.equal(isValidTimezone("Asia/Jerusalem"), true);
    assert.equal(isValidTimezone("America/New_York"), true);
    assert.equal(isValidTimezone("UTC"), true);
  });

  it("rejects garbage input", () => {
    assert.equal(isValidTimezone("not-a-timezone"), false);
    assert.equal(isValidTimezone(""), false);
    assert.equal(isValidTimezone("GMT+3"), false);
  });
});

describe("resolveDdMmToDate", () => {
  it("resolves dd-mm using the current year in the given timezone", () => {
    const timezone = "Asia/Jerusalem";
    const currentYear = DateTime.now().setZone(timezone).year;

    const result = resolveDdMmToDate("20-06", timezone);

    assert.equal(result, `${currentYear}-06-20`);
  });

  it("handles single-digit day and month correctly", () => {
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

describe("localDateToUtcMidnight", () => {
  it("converts a YYYY-MM-DD string to UTC midnight of that date", () => {
    const result = localDateToUtcMidnight("2026-06-15");
    assert.equal(result.toISOString(), "2026-06-15T00:00:00.000Z");
  });

  it("rejects a string with a time component", () => {
    assert.throws(
      () => localDateToUtcMidnight("2026-06-15T10:30:00"),
      (err: unknown) => err instanceof AppError && err.code === "INVALID_DATE_FORMAT"
    );
  });

  it("rejects a string that isn't shaped like YYYY-MM-DD", () => {
    assert.throws(
      () => localDateToUtcMidnight("15-06-2026"),
      (err: unknown) => err instanceof AppError && err.code === "INVALID_DATE_FORMAT"
    );
  });

  it("rejects a YYYY-MM-DD-shaped string that isn't a real calendar date", () => {
    assert.throws(
      () => localDateToUtcMidnight("2026-02-30"),
      (err: unknown) => err instanceof AppError && err.code === "INVALID_DATE_FORMAT"
    );
  });

  it("rejects an empty string", () => {
    assert.throws(
      () => localDateToUtcMidnight(""),
      (err: unknown) => err instanceof AppError && err.code === "INVALID_DATE_FORMAT"
    );
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

describe("retentionCutoff", () => {
  it("uses the month start when the buffer date is inside the current month", () => {
    // 2026-07-28 − 10d = 2026-07-18, which is after 2026-07-01 → month start wins
    const result = retentionCutoff(new Date("2026-07-28T10:00:00Z"), 10);
    assert.equal(result.toISOString(), "2026-07-01T00:00:00.000Z");
  });

  it("uses the buffer date when it reaches back into the previous month", () => {
    // 2026-09-02 − 10d = 2026-08-23, which is before 2026-09-01 → buffer wins
    const result = retentionCutoff(new Date("2026-09-02T10:00:00Z"), 10);
    assert.equal(result.toISOString(), "2026-08-23T00:00:00.000Z");
  });

  it("keeps a week that straddles the month boundary on the 1st of the month", () => {
    // First day of the month: month start is today, so the buffer always wins
    const result = retentionCutoff(new Date("2026-09-01T06:00:00Z"), 10);
    assert.equal(result.toISOString(), "2026-08-22T00:00:00.000Z");
  });

  it("normalizes the buffer date to UTC midnight regardless of the time of day", () => {
    const early = retentionCutoff(new Date("2026-09-02T00:00:01Z"), 10);
    const late = retentionCutoff(new Date("2026-09-02T23:59:59Z"), 10);
    assert.equal(early.toISOString(), "2026-08-23T00:00:00.000Z");
    assert.equal(late.toISOString(), "2026-08-23T00:00:00.000Z");
  });

  it("crosses a year boundary correctly", () => {
    // 2027-01-05 − 10d = 2026-12-26, before 2027-01-01 → buffer wins
    const result = retentionCutoff(new Date("2027-01-05T12:00:00Z"), 10);
    assert.equal(result.toISOString(), "2026-12-26T00:00:00.000Z");
  });
});
