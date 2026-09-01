import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isMultipleOfHalf } from "./numberUtils";

describe("isMultipleOfHalf", () => {
  it("returns true for whole numbers", () => {
    assert.equal(isMultipleOfHalf(0), true);
    assert.equal(isMultipleOfHalf(1), true);
    assert.equal(isMultipleOfHalf(-3), true);
  });

  it("returns true for exact half-steps", () => {
    assert.equal(isMultipleOfHalf(0.5), true);
    assert.equal(isMultipleOfHalf(1.5), true);
    assert.equal(isMultipleOfHalf(-2.5), true);
  });

  it("returns false for non-half-step decimals", () => {
    assert.equal(isMultipleOfHalf(0.3), false);
    assert.equal(isMultipleOfHalf(1.25), false);
    assert.equal(isMultipleOfHalf(-1.1), false);
  });

  it("tolerates floating point noise from arithmetic", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE-754; not itself a half-step,
    // but a value like 1.5 - 1 should still read as clean 0.5.
    assert.equal(isMultipleOfHalf(1.5 - 1), true);
  });

  it("returns false for NaN and Infinity", () => {
    assert.equal(isMultipleOfHalf(NaN), false);
    assert.equal(isMultipleOfHalf(Infinity), false);
    assert.equal(isMultipleOfHalf(-Infinity), false);
  });
});
