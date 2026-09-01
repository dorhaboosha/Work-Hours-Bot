import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatMinutesAsDuration, formatBalance, formatDecimalDays } from "./formatUtils";

describe("formatMinutesAsDuration", () => {
  it("formats a positive duration with hours and minutes", () => {
    assert.equal(formatMinutesAsDuration(570), "09:30");
  });

  it("formats minutes-only durations with zero-padded hours", () => {
    assert.equal(formatMinutesAsDuration(42), "00:42");
  });

  it("formats negative durations with a leading dash", () => {
    assert.equal(formatMinutesAsDuration(-80), "-01:20");
  });

  it("formats zero as 00:00", () => {
    assert.equal(formatMinutesAsDuration(0), "00:00");
  });

  it("formats exactly one hour", () => {
    assert.equal(formatMinutesAsDuration(60), "01:00");
  });

  it("formats large hour values correctly", () => {
    assert.equal(formatMinutesAsDuration(528), "08:48");
  });

  it("zero-pads single-digit minutes", () => {
    assert.equal(formatMinutesAsDuration(61), "01:01");
  });
});

describe("formatBalance", () => {
  it("prefixes positive balances with +", () => {
    assert.equal(formatBalance(42), "+00:42");
  });

  it("preserves the - sign for negative balances", () => {
    assert.equal(formatBalance(-80), "-01:20");
  });

  it("returns 00:00 for zero balance (no + prefix)", () => {
    assert.equal(formatBalance(0), "00:00");
  });

  it("formats a large positive balance correctly", () => {
    assert.equal(formatBalance(135), "+02:15");
  });

  it("formats a large negative balance correctly", () => {
    assert.equal(formatBalance(-736), "-12:16");
  });
});

describe("formatDecimalDays", () => {
  it("formats a whole number with no decimal", () => {
    assert.equal(formatDecimalDays(1), "1");
  });

  it("formats a half-day value with one decimal place", () => {
    assert.equal(formatDecimalDays(1.5), "1.5");
  });

  it("formats zero as 0", () => {
    assert.equal(formatDecimalDays(0), "0");
  });

  it("keeps the minus sign for negative values", () => {
    assert.equal(formatDecimalDays(-2.5), "-2.5");
  });

  it("formats a negative whole number with no decimal", () => {
    assert.equal(formatDecimalDays(-3), "-3");
  });

  it("rounds to one decimal place", () => {
    assert.equal(formatDecimalDays(0.3 * 3), "0.9"); // guards against 0.8999999999999999
  });
});
