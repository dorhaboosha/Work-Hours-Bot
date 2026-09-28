import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { UserSettings } from "@/generated/prisma/client";
import { formatSettingsDisplay } from "./formatMessage";

function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    dailyRequiredMinutes: 528,
    cholHamoedRequiredMinutes: null,
    workdays: [0, 1, 2, 3, 4],
    timezone: "Asia/Jerusalem",
    vacationAccrualRate: 1,
    sickAccrualRate: 1.5,
    ...overrides,
  } as UserSettings;
}

describe("formatSettingsDisplay", () => {
  it("shows 'same as daily' when no Chol HaMoed hours are set", () => {
    const text = formatSettingsDisplay(makeSettings());

    assert.match(text, /Daily hours: +\*08:48\*/);
    assert.match(text, /Chol HaMoed hours: \*same as daily\*/);
  });

  it("shows the Chol HaMoed hours when set", () => {
    const text = formatSettingsDisplay(makeSettings({ cholHamoedRequiredMinutes: 420 }));

    assert.match(text, /Chol HaMoed hours: \*07:00\*/);
  });

  it("fills every placeholder", () => {
    assert.doesNotMatch(formatSettingsDisplay(makeSettings()), /\{\{/);
  });
});
