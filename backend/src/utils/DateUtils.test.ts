import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getLocalDate,
  utcToLocalDate,
  utcToLocalTime,
  manualEndTimeToUtc,
  addMinutesUtc,
  minutesBetween,
} from "./DateUtils";

// Fixed UTC base: 2026-06-12 05:15:00 UTC
// In Asia/Jerusalem (UTC+3):  2026-06-12 08:15 local
// In America/New_York (UTC-4): 2026-06-12 01:15 local  →  still 2026-06-12
// In Pacific/Auckland (UTC+12): 2026-06-12 17:15 local
const BASE_UTC = new Date("2026-06-12T05:15:00.000Z");
const BASE_ISO = "2026-06-12T05:15:00.000Z";

// -----------------------------------------------------------------------

describe("utcToLocalDate", () => {
  it("returns the same calendar date for a mid-day UTC time in Jerusalem", () => {
    assert.equal(utcToLocalDate(BASE_UTC, "Asia/Jerusalem"), "2026-06-12");
  });

  it("returns the same calendar date when passed an ISO string", () => {
    assert.equal(utcToLocalDate(BASE_ISO, "Asia/Jerusalem"), "2026-06-12");
  });

  it("returns a different date when UTC midnight crosses a date boundary", () => {
    // 2026-06-12 22:30 UTC → 2026-06-13 01:30 in Jerusalem (UTC+3)
    const lateUtc = new Date("2026-06-12T22:30:00.000Z");
    assert.equal(utcToLocalDate(lateUtc, "Asia/Jerusalem"), "2026-06-13");
  });

  it("handles a timezone behind UTC correctly", () => {
    // 2026-06-12 02:00 UTC → 2026-06-11 22:00 in New York (UTC-4 in summer)
    const earlyUtc = new Date("2026-06-12T02:00:00.000Z");
    assert.equal(utcToLocalDate(earlyUtc, "America/New_York"), "2026-06-11");
  });
});

// -----------------------------------------------------------------------

describe("utcToLocalTime", () => {
  it("formats UTC time as HH:mm in the user's timezone", () => {
    // 05:15 UTC → 08:15 in Jerusalem (UTC+3)
    assert.equal(utcToLocalTime(BASE_UTC, "Asia/Jerusalem"), "08:15");
  });

  it("works with an ISO string input", () => {
    assert.equal(utcToLocalTime(BASE_ISO, "Asia/Jerusalem"), "08:15");
  });

  it("applies a negative offset correctly", () => {
    // 05:15 UTC → 01:15 in New York (UTC-4 in summer)
    assert.equal(utcToLocalTime(BASE_UTC, "America/New_York"), "01:15");
  });

  it("zero-pads hours and minutes", () => {
    // 2026-06-12 00:05 UTC → 03:05 in Jerusalem
    const earlyUtc = new Date("2026-06-12T00:05:00.000Z");
    assert.equal(utcToLocalTime(earlyUtc, "Asia/Jerusalem"), "03:05");
  });
});

// -----------------------------------------------------------------------

describe("manualEndTimeToUtc — previous-day close semantics", () => {
  it("applies manualEndTime to the original workDate, not the current date", () => {
    // workDate: 2026-06-12 (a Thursday in Jerusalem)
    // manualEndTime: "17:30"
    // Jerusalem in June is UTC+3 → expected UTC: 2026-06-12T14:30:00.000Z
    const result = manualEndTimeToUtc("2026-06-12", "17:30", "Asia/Jerusalem");
    assert.equal(result.toISOString(), "2026-06-12T14:30:00.000Z");
  });

  it("produces a UTC timestamp from a negative-offset timezone", () => {
    // New York in June is UTC-4 → 17:30 local = 21:30 UTC
    const result = manualEndTimeToUtc("2026-06-12", "17:30", "America/New_York");
    assert.equal(result.toISOString(), "2026-06-12T21:30:00.000Z");
  });

  it("handles midnight as manualEndTime", () => {
    // 00:00 Jerusalem (UTC+3) → 2026-06-11T21:00:00.000Z (previous UTC day)
    const result = manualEndTimeToUtc("2026-06-12", "00:00", "Asia/Jerusalem");
    assert.equal(result.toISOString(), "2026-06-11T21:00:00.000Z");
  });

  it("does NOT use the current system date — result date matches workDate", () => {
    // The resulting UTC date should correspond to 2026-06-10, not today
    const result = manualEndTimeToUtc("2026-06-10", "09:00", "Asia/Jerusalem");
    // 09:00 Jerusalem (UTC+3) = 06:00 UTC same day
    assert.equal(result.toISOString(), "2026-06-10T06:00:00.000Z");
  });
});

// -----------------------------------------------------------------------

describe("addMinutesUtc", () => {
  it("adds minutes to a UTC date correctly", () => {
    // 05:15 UTC + 528 minutes (8h48m) = 14:03 UTC
    const result = addMinutesUtc(BASE_UTC, 528);
    assert.equal(result.toISOString(), "2026-06-12T14:03:00.000Z");
  });

  it("handles adding zero minutes", () => {
    const result = addMinutesUtc(BASE_UTC, 0);
    assert.equal(result.toISOString(), BASE_ISO);
  });

  it("crosses a date boundary correctly", () => {
    // 22:00 UTC + 180 minutes = next day 01:00 UTC
    const lateBase = new Date("2026-06-12T22:00:00.000Z");
    const result = addMinutesUtc(lateBase, 180);
    assert.equal(result.toISOString(), "2026-06-13T01:00:00.000Z");
  });
});

// -----------------------------------------------------------------------

describe("minutesBetween", () => {
  it("returns whole minutes between two UTC dates", () => {
    const start = new Date("2026-06-12T05:15:00.000Z");
    const end = new Date("2026-06-12T14:03:00.000Z");
    assert.equal(minutesBetween(start, end), 528);
  });

  it("returns 0 when end equals start", () => {
    assert.equal(minutesBetween(BASE_UTC, BASE_UTC), 0);
  });

  it("clamps to 0 when end is before start", () => {
    assert.equal(minutesBetween(BASE_UTC, new Date("2026-06-12T04:00:00.000Z")), 0);
  });

  it("floors partial minutes", () => {
    const start = new Date("2026-06-12T10:00:00.000Z");
    const end = new Date("2026-06-12T10:01:45.000Z"); // 1 min 45 sec
    assert.equal(minutesBetween(start, end), 1);
  });
});
