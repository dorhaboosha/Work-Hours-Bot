import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { EditDayOptions, EditWorkdayResult, WorkPeriodView } from "@shared/types/ViewTypes";
import { buildEditMenu } from "@/constants/editActions";
import { formatEditMenuPrompt, formatPeriodsSaved } from "./formatEditMessage";

// Asia/Jerusalem is UTC+3 in early October 2026.
const TIMEZONE = "Asia/Jerusalem";

const OFFICE: WorkPeriodView = {
  startTime: "2026-10-07T06:00:00.000Z", // 09:00
  endTime: "2026-10-07T08:00:00.000Z", // 11:00
  workedMinutes: 120,
};
const HOME: WorkPeriodView = {
  startTime: "2026-10-07T10:00:00.000Z", // 13:00
  endTime: "2026-10-07T12:30:00.000Z", // 15:30
  workedMinutes: 150,
};

function makeOptions(overrides: Partial<EditDayOptions>): EditDayOptions {
  return {
    workDate: "2026-10-07",
    displayDate: "07-10",
    timezone: TIMEZONE,
    state: "NO_RECORD",
    record: null,
    periods: [],
    allowedActions: ["SET_START_AND_END_HOURS", "MARK_ABSENCE"],
    ...overrides,
  };
}

function makeResult(overrides: Partial<EditWorkdayResult>): EditWorkdayResult {
  return {
    id: "r1",
    telegramId: "u1",
    workDate: "2026-10-07",
    displayDate: "07-10",
    recordType: "WORK",
    absencePortion: null,
    workedMinutes: 270,
    periods: [OFFICE, HOME],
    creditedMinutes: 0,
    requiredMinutes: 480,
    balanceMinutes: -210,
    ...overrides,
  };
}

describe("formatEditMenuPrompt", () => {
  it("shows the header, the day's numbered periods and the numbered options", () => {
    const options = makeOptions({
      state: "CLOSED_WORK_RECORD",
      periods: [OFFICE, HOME],
      allowedActions: [
        "SET_START_AND_END_HOURS", "ADD_WORK_PERIOD", "EDIT_WORK_PERIOD", "DELETE_WORK_PERIOD",
        "MARK_ABSENCE", "CANCEL",
      ],
    });
    const menu = buildEditMenu(options.state, options.allowedActions, options.periods.length);

    assert.equal(
      formatEditMenuPrompt(options, menu),
      "📋 *07-10 — completed work record*\n\n" +
        "🕐 Work periods:\n1. *09:00–11:00* (02:00)\n2. *13:00–15:30* (02:30)\n\n" +
        "What do you want to do?\n\n" +
        "1. Set the whole day as one period\n2. Add a work period\n3. Edit a work period\n" +
        "4. Delete a work period\n5. Mark absence instead\n6. Cancel"
    );
  });

  it("has no period list for a date without hours", () => {
    const options = makeOptions({});
    const menu = buildEditMenu(options.state, options.allowedActions, 0);

    assert.equal(
      formatEditMenuPrompt(options, menu),
      "📋 *No record found for 07-10*\n\nWhat do you want to do?\n\n" +
        "1. Set start and end hours\n2. Mark absence\n3. Cancel"
    );
  });
});

describe("formatPeriodsSaved", () => {
  it("lists the periods, then the worked total and balance", () => {
    assert.equal(
      formatPeriodsSaved(makeResult({}), "Work period added", TIMEZONE),
      "✅ *Work period added*\n\n📅 Date:    *07-10*\n\n" +
        "🕐 Work periods:\n1. *09:00–11:00* (02:00)\n2. *13:00–15:30* (02:30)\n\n" +
        "✅ Worked:  *04:30*\n⚖️ Balance: *-03:30*"
    );
  });

  it("shows a half day's credit, and 'No hours logged' once its last period is gone", () => {
    const text = formatPeriodsSaved(
      makeResult({
        recordType: "VACATION",
        absencePortion: "HALF",
        creditedMinutes: 240,
        workedMinutes: 0,
        periods: [],
        balanceMinutes: -240,
      }),
      "Work period 1 deleted",
      TIMEZONE
    );

    assert.match(text, /📋 Vacation day \(half day\): \*04:00\*/);
    assert.match(text, /🕐 No hours logged/);
    assert.ok(text.includes("✅ Worked:  *00:00*"));
  });
});
