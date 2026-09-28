import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isCholHamoed } from "./hebrewCalendarUtils";
import { AppError } from "@/utils/AppError";

describe("isCholHamoed", () => {
  it("covers Sukkot Chol HaMoed 2026 (16–21 Tishri), including Hoshana Raba", () => {
    for (const date of ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]) {
      assert.equal(isCholHamoed(date), true, date);
    }
  });

  it("excludes the first day of Sukkot and Shemini Atzeret", () => {
    assert.equal(isCholHamoed("2026-09-26"), false); // 15 Tishri
    assert.equal(isCholHamoed("2026-10-03"), false); // 22 Tishri
  });

  it("covers Pesach Chol HaMoed 2027 (16–20 Nisan) in a Hebrew leap year", () => {
    // 5787 is a leap year (Adar I + Adar II) — Nisan must still resolve correctly.
    assert.equal(isCholHamoed("2027-04-22"), false); // 15 Nisan
    for (const date of ["2027-04-23", "2027-04-24", "2027-04-25", "2027-04-26", "2027-04-27"]) {
      assert.equal(isCholHamoed(date), true, date);
    }
    assert.equal(isCholHamoed("2027-04-28"), false); // 21 Nisan (Shvi'i shel Pesach)
  });

  it("covers Pesach Chol HaMoed 2025 in a non-leap year", () => {
    assert.equal(isCholHamoed("2025-04-13"), false); // 15 Nisan
    assert.equal(isCholHamoed("2025-04-14"), true);  // 16 Nisan
    assert.equal(isCholHamoed("2025-04-18"), true);  // 20 Nisan
    assert.equal(isCholHamoed("2025-04-19"), false); // 21 Nisan
  });

  it("returns false for ordinary days and other holidays", () => {
    assert.equal(isCholHamoed("2026-06-15"), false);
    assert.equal(isCholHamoed("2026-09-21"), false); // Yom Kippur
    assert.equal(isCholHamoed("2026-09-12"), false); // Rosh Hashana
  });

  it("throws INVALID_DATE_FORMAT for a malformed date", () => {
    assert.throws(() => isCholHamoed("27-09-2026"), (err) => err instanceof AppError);
  });
});
