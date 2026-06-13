import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatMinutesAsDuration, formatBalance } from "./formatUtils";

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
