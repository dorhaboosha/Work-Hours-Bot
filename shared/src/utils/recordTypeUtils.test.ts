import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAbsenceRecordType,
  calculateCreditedMinutes,
  getLeaveBalanceField,
  resolveAbsenceTerms,
  canLogHours,
} from "./recordTypeUtils";
import type { AbsencePortion, AbsenceRecordType } from "../types/CoreTypes";

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

describe("getLeaveBalanceField", () => {
  it("maps VACATION to vacationBalance", () => {
    assert.equal(getLeaveBalanceField("VACATION"), "vacationBalance");
  });

  it("maps HOLIDAY to null (company-paid, no balance debited)", () => {
    assert.equal(getLeaveBalanceField("HOLIDAY"), null);
  });

  it("maps HOLIDAY_EVE to null (company-paid, no balance debited)", () => {
    assert.equal(getLeaveBalanceField("HOLIDAY_EVE"), null);
  });

  it("maps SICK to sickBalance", () => {
    assert.equal(getLeaveBalanceField("SICK"), "sickBalance");
  });

  it("maps UNPAID_ABSENCE to null (no balance debited)", () => {
    assert.equal(getLeaveBalanceField("UNPAID_ABSENCE"), null);
  });

  it("maps ELECTION to null (no balance debited)", () => {
    assert.equal(getLeaveBalanceField("ELECTION"), null);
  });
});

describe("resolveAbsenceTerms", () => {
  const required = 528; // 8h 48m
  const half = 264;

  const cases: Array<{
    type: AbsenceRecordType;
    portion: AbsencePortion;
    expected: ReturnType<typeof resolveAbsenceTerms>;
  }> = [
    { type: "HOLIDAY",        portion: "FULL", expected: { portion: "FULL", creditedMinutes: required, debitField: null,              debitDays: null, allowsWorkHours: false } },
    { type: "ELECTION",       portion: "FULL", expected: { portion: "FULL", creditedMinutes: required, debitField: null,              debitDays: null, allowsWorkHours: false } },
    { type: "UNPAID_ABSENCE", portion: "FULL", expected: { portion: "FULL", creditedMinutes: 0,        debitField: null,              debitDays: null, allowsWorkHours: false } },
    { type: "VACATION",       portion: "FULL", expected: { portion: "FULL", creditedMinutes: required, debitField: "vacationBalance", debitDays: 1,    allowsWorkHours: false } },
    { type: "VACATION",       portion: "HALF", expected: { portion: "HALF", creditedMinutes: half,     debitField: "vacationBalance", debitDays: 0.5,  allowsWorkHours: true  } },
    { type: "SICK",           portion: "FULL", expected: { portion: "FULL", creditedMinutes: required, debitField: "sickBalance",     debitDays: 1,    allowsWorkHours: false } },
    { type: "SICK",           portion: "HALF", expected: { portion: "HALF", creditedMinutes: half,     debitField: "sickBalance",     debitDays: 0.5,  allowsWorkHours: true  } },
    { type: "HOLIDAY_EVE",    portion: "FULL", expected: { portion: "FULL", creditedMinutes: required, debitField: "vacationBalance", debitDays: 0.5,  allowsWorkHours: false } },
    { type: "HOLIDAY_EVE",    portion: "HALF", expected: { portion: "HALF", creditedMinutes: half,     debitField: null,              debitDays: null, allowsWorkHours: true  } },
  ];

  for (const { type, portion, expected } of cases) {
    it(`${type} ${portion}`, () => {
      assert.deepEqual(resolveAbsenceTerms(type, portion, required), expected);
    });
  }

  it("normalizes HALF to FULL for types that can't be split (HOLIDAY, ELECTION, UNPAID_ABSENCE)", () => {
    for (const type of ["HOLIDAY", "ELECTION", "UNPAID_ABSENCE"] as const) {
      assert.deepEqual(
        resolveAbsenceTerms(type, "HALF", required),
        resolveAbsenceTerms(type, "FULL", required)
      );
    }
  });

  it("floors half a day for an odd number of required minutes", () => {
    assert.equal(resolveAbsenceTerms("VACATION", "HALF", 529).creditedMinutes, 264);
    assert.equal(resolveAbsenceTerms("HOLIDAY_EVE", "HALF", 529).creditedMinutes, 264);
  });

  it("matches the existing credit rule for full-day absences and the default HOLIDAY_EVE", () => {
    for (const type of ["SICK", "VACATION", "HOLIDAY", "ELECTION", "UNPAID_ABSENCE"] as const) {
      assert.equal(
        resolveAbsenceTerms(type, "FULL", required).creditedMinutes,
        calculateCreditedMinutes(type, required)
      );
    }
    assert.equal(
      resolveAbsenceTerms("HOLIDAY_EVE", "HALF", required).creditedMinutes,
      calculateCreditedMinutes("HOLIDAY_EVE", required)
    );
  });
});

describe("canLogHours", () => {
  it("returns true for WORK", () => {
    assert.equal(canLogHours({ recordType: "WORK" }), true);
  });

  it("returns true for a HALF absence", () => {
    assert.equal(canLogHours({ recordType: "VACATION", absencePortion: "HALF" }), true);
    assert.equal(canLogHours({ recordType: "HOLIDAY_EVE", absencePortion: "HALF" }), true);
  });

  it("returns false for a FULL absence", () => {
    assert.equal(canLogHours({ recordType: "VACATION", absencePortion: "FULL" }), false);
    assert.equal(canLogHours({ recordType: "HOLIDAY", absencePortion: "FULL" }), false);
  });

  it("returns false for an absence with no portion set", () => {
    assert.equal(canLogHours({ recordType: "SICK", absencePortion: null }), false);
    assert.equal(canLogHours({ recordType: "SICK" }), false);
  });
});
