import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DateRecordLookup, WorkPeriodView } from "@shared/types/ViewTypes";
import type { DailyRecord } from "@shared/types/CoreTypes";
import { formatRecordMessage } from "./formatRecordMessage";

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

function makeLookup(
  state: Exclude<DateRecordLookup["state"], "NO_RECORD">,
  record: Partial<DailyRecord>,
  periods: WorkPeriodView[]
): DateRecordLookup {
  return {
    workDate: "2026-10-07",
    displayDate: "07-10",
    timezone: TIMEZONE,
    periods,
    state,
    record: {
      id: "r1",
      telegramId: "u1",
      workDate: "2026-10-07",
      recordType: "WORK",
      absencePortion: null,
      creditedMinutes: 0,
      createdAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:00:00.000Z",
      ...record,
    },
  };
}

describe("formatRecordMessage", () => {
  it("keeps the Start/End layout for a day with a single period", () => {
    const text = formatRecordMessage(
      makeLookup(
        "COMPLETED_WORK_RECORD",
        { startTime: OFFICE.startTime, endTime: OFFICE.endTime, workedMinutes: 120 },
        [OFFICE]
      ),
      "07-10"
    );

    assert.equal(
      text,
      "📋 *Record for 07-10*\n\n🕐 Start:   *09:00*\n🏁 End:     *11:00*\n✅ Worked:  *02:00*"
    );
  });

  it("lists every period, then a blank line and the worked total, for a multi-period day", () => {
    const text = formatRecordMessage(
      makeLookup(
        "COMPLETED_WORK_RECORD",
        { startTime: OFFICE.startTime, endTime: HOME.endTime, workedMinutes: 270 },
        [OFFICE, HOME]
      ),
      "07-10"
    );

    assert.equal(
      text,
      "📋 *Record for 07-10*\n\n" +
        "🕐 Work periods:\n1. *09:00–11:00* (02:00)\n2. *13:00–15:30* (02:30)\n\n" +
        "✅ Worked:  *04:30*"
    );
  });

  it("lists a half day's periods under its credit, with the same blank line before Worked", () => {
    const text = formatRecordMessage(
      makeLookup(
        "ABSENCE_RECORD",
        {
          recordType: "VACATION",
          absencePortion: "HALF",
          creditedMinutes: 264,
          startTime: OFFICE.startTime,
          endTime: HOME.endTime,
          workedMinutes: 270,
        },
        [OFFICE, HOME]
      ),
      "07-10"
    );

    assert.equal(
      text,
      "📋 *Record for 07-10*\n\n" +
        "📂 Status:   *Vacation day (half day)*\n📋 Credited: *04:24*\n\n" +
        "🕐 Work periods:\n1. *09:00–11:00* (02:00)\n2. *13:00–15:30* (02:30)\n\n" +
        "✅ Worked:   *04:30*"
    );
  });

  it("shows the open period and the time worked so far on an open multi-period day", () => {
    const open: WorkPeriodView = { ...HOME, endTime: null, workedMinutes: 70 };
    const text = formatRecordMessage(
      makeLookup("OPEN_WORK_RECORD", { startTime: OFFICE.startTime, endTime: null }, [OFFICE, open]),
      "07-10"
    );

    assert.match(text, /2\. \*13:00–now\* \(01:10\)\n\n✅ Worked so far: \*03:10\*/);
    assert.match(text, /Status: \*Open\*/);
  });
});
