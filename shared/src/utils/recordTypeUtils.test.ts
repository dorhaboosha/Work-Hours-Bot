import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAbsenceRecordType, calculateCreditedMinutes } from "./recordTypeUtils";

describe("isAbsenceRecordType", () => {
  it("returns false for WORK", () => {
    assert.equal(isAbsenceRecordType("WORK"), false);
  });

  it("returns true for SICK", () => {
    assert.equal(isAbsenceRecordType("SICK"), true);
  });

  it("returns true for VACATION", () => {
    assert.equal(isAbsenceRecordType("VACATION"), true);
  });

  it("returns true for HOLIDAY", () => {
    assert.equal(isAbsenceRecordType("HOLIDAY"), true);
  });

  it("returns true for HOLIDAY_EVE", () => {
    assert.equal(isAbsenceRecordType("HOLIDAY_EVE"), true);
  });

  it("returns true for UNPAID_ABSENCE", () => {
    assert.equal(isAbsenceRecordType("UNPAID_ABSENCE"), true);
  });

  it("returns true for ELECTION", () => {
    assert.equal(isAbsenceRecordType("ELECTION"), true);
  });
});

describe("calculateCreditedMinutes", () => {
  const required = 528; // 8h 48m

  it("credits a full day for SICK", () => {
    assert.equal(calculateCreditedMinutes("SICK", required), 528);
  });

  it("credits a full day for VACATION", () => {
    assert.equal(calculateCreditedMinutes("VACATION", required), 528);
  });

  it("credits a full day for HOLIDAY", () => {
    assert.equal(calculateCreditedMinutes("HOLIDAY", required), 528);
  });

  it("credits a full day for ELECTION", () => {
    assert.equal(calculateCreditedMinutes("ELECTION", required), 528);
  });

  it("credits half a day (floor) for HOLIDAY_EVE", () => {
    assert.equal(calculateCreditedMinutes("HOLIDAY_EVE", required), 264);
  });

  it("floors the half-day when dailyRequiredMinutes is odd", () => {
    assert.equal(calculateCreditedMinutes("HOLIDAY_EVE", 529), 264);
  });

  it("credits 0 minutes for UNPAID_ABSENCE", () => {
    assert.equal(calculateCreditedMinutes("UNPAID_ABSENCE", required), 0);
  });

  it("works correctly with a different required value", () => {
    assert.equal(calculateCreditedMinutes("SICK", 480), 480);       // 8h exactly
    assert.equal(calculateCreditedMinutes("HOLIDAY_EVE", 480), 240); // 4h exactly
    assert.equal(calculateCreditedMinutes("UNPAID_ABSENCE", 480), 0);
  });
});
