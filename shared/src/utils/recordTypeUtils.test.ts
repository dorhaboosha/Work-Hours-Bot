import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAbsenceRecordType,
  requiresPortionChoice,
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

describe("requiresPortionChoice", () => {
  it("returns true for VACATION and SICK", () => {
    assert.equal(requiresPortionChoice("VACATION"), true);
    assert.equal(requiresPortionChoice("SICK"), true);
  });

  it("returns false for types with a fixed portion", () => {
    for (const type of ["HOLIDAY", "HOLIDAY_EVE", "ELECTION", "UNPAID_ABSENCE"] as const) {
      assert.equal(requiresPortionChoice(type), false);
    }
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
