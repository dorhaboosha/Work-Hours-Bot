import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { UserSettings } from "@/generated/prisma/client";
import { formatSettingsDisplay, formatWorkPeriodsList } from "./formatMessage";

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

describe("formatWorkPeriodsList", () => {
  it("numbers the periods in order, in the user's timezone, with each period's duration", () => {
    const text = formatWorkPeriodsList(
      [
        // 08:00–13:00 and 15:00–18:30 in Asia/Jerusalem (UTC+3 in October 2026)
        { startTime: "2026-10-05T05:00:00.000Z", endTime: "2026-10-05T10:00:00.000Z", workedMinutes: 300 },
        { startTime: "2026-10-05T12:00:00.000Z", endTime: "2026-10-05T15:30:00.000Z", workedMinutes: 210 },
      ],
      "Asia/Jerusalem"
    );

    assert.equal(text, "1. *08:00–13:00* (05:00)\n2. *15:00–18:30* (03:30)");
  });

  it("shows the open period as running until now", () => {
    const text = formatWorkPeriodsList(
      [
        { startTime: "2026-10-05T05:00:00.000Z", endTime: "2026-10-05T10:00:00.000Z", workedMinutes: 300 },
        { startTime: "2026-10-05T12:00:00.000Z", endTime: null, workedMinutes: 70 },
      ],
      "Asia/Jerusalem"
    );

    assert.equal(text.split("\n")[1], "2. *15:00–now* (01:10)");
  });
});
