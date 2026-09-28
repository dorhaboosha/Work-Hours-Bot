import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requiredMinutesFor } from "./requiredMinutes";

const WITH_OVERRIDE = { dailyRequiredMinutes: 528, cholHamoedRequiredMinutes: 420 };
const WITHOUT_OVERRIDE = { dailyRequiredMinutes: 528, cholHamoedRequiredMinutes: null };

describe("requiredMinutesFor", () => {
  it("returns the Chol HaMoed minutes on a Chol HaMoed day when set", () => {
    assert.equal(requiredMinutesFor(WITH_OVERRIDE, "2026-09-27"), 420);
  });

  it("returns the daily minutes on an ordinary day even when the override is set", () => {
    assert.equal(requiredMinutesFor(WITH_OVERRIDE, "2026-10-04"), 528);
  });

  it("returns the daily minutes on a Chol HaMoed day when no override is set", () => {
    assert.equal(requiredMinutesFor(WITHOUT_OVERRIDE, "2026-09-27"), 528);
  });
});
