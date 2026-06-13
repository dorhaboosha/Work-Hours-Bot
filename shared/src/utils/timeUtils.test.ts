import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decimalHoursToMinutes, isWorkday } from "./timeUtils";

describe("decimalHoursToMinutes", () => {
  it("converts standard 8.8 hours to 528 minutes", () => {
    assert.equal(decimalHoursToMinutes(8.8), 528);
  });

  it("converts whole hours with no remainder", () => {
    assert.equal(decimalHoursToMinutes(8), 480);
  });

  it("rounds half-minute fractions up", () => {
    // 0.5h = 30m exactly
    assert.equal(decimalHoursToMinutes(0.5), 30);
  });

  it("rounds fractional minutes correctly", () => {
    // 8.783333...h = 527 minutes (rounds to 527)
    assert.equal(decimalHoursToMinutes(8.783333), 527);
  });

  it("returns 0 for 0 hours", () => {
    assert.equal(decimalHoursToMinutes(0), 0);
  });
});

describe("isWorkday", () => {
  const sundayToThursday = [0, 1, 2, 3, 4] as const;
  const mondayToFriday = [1, 2, 3, 4, 5] as const;

  it("returns true for a day in the workdays list", () => {
    assert.equal(isWorkday(0, [...sundayToThursday]), true); // Sunday
    assert.equal(isWorkday(4, [...sundayToThursday]), true); // Thursday
  });

  it("returns false for a day not in the workdays list", () => {
    assert.equal(isWorkday(5, [...sundayToThursday]), false); // Friday
    assert.equal(isWorkday(6, [...sundayToThursday]), false); // Saturday
  });

  it("handles Monday-Friday schedule", () => {
    assert.equal(isWorkday(1, [...mondayToFriday]), true);  // Monday
    assert.equal(isWorkday(5, [...mondayToFriday]), true);  // Friday
    assert.equal(isWorkday(0, [...mondayToFriday]), false); // Sunday
    assert.equal(isWorkday(6, [...mondayToFriday]), false); // Saturday
  });

  it("returns false for an empty workdays array", () => {
    assert.equal(isWorkday(1, []), false);
  });
});
