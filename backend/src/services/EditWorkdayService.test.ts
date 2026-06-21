import { describe, it, mock, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { Module } from "node:module";

function injectCacheStub(
  resolvedPath: string,
  exports: Record<string, unknown>
): void {
  delete require.cache[resolvedPath];
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports,
    parent: null,
    children: [],
    paths: [],
  } as unknown as Module;
}

// ── Fixed test data ────────────────────────────────────────────────────────────

/** The date being edited in all tests. Matches "12-06" in any year. */
const FIXED_DATE = "2026-06-12";
const TIMEZONE   = "Asia/Jerusalem";
const DAILY_MIN  = 480; // 8 h

const SETTINGS = {
  id: "s1",
  telegramId: "user1",
  dailyRequiredMinutes: DAILY_MIN,
  timezone: TIMEZONE,
  workdays: [0, 1, 2, 3, 4],
  language: "en",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// 06:00 UTC = 09:00 Jerusalem — used as the existing start time in open records
const START_UTC = new Date("2026-06-12T06:00:00Z");

function makeWorkRecord(closed = false) {
  return {
    id: "r1",
    telegramId: "user1",
    workDate: new Date("2026-06-12T00:00:00Z"),
    recordType: "WORK",
    startTime: START_UTC,
    expectedEndTime: new Date(START_UTC.getTime() + DAILY_MIN * 60_000),
    endTime: closed ? new Date("2026-06-12T14:00:00Z") : null,
    workedMinutes: closed ? DAILY_MIN : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeAbsenceRecord(recordType: string, workedMinutes: number) {
  return {
    id: "r2",
    telegramId: "user1",
    workDate: new Date("2026-06-12T00:00:00Z"),
    recordType,
    startTime: null,
    expectedEndTime: null,
    endTime: null,
    workedMinutes,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe("EditWorkdayService", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getEditDayOptions: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let assertActionAllowed: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setEndHour: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setStartAndEndHours: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let markAbsence: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockFindRecordByDate: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockUpdateDailyRecord: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockUpsertRecordByDate: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockGetSettingsOrThrow: ReturnType<typeof mock.fn<any>>;

  before(() => {
    mockFindRecordByDate = mock.fn(async () => null); // default → NO_RECORD state
    mockUpdateDailyRecord = mock.fn(
      async (id: string, updates: Record<string, unknown>) => ({
        ...makeWorkRecord(false),
        id,
        ...updates,
      })
    );
    mockUpsertRecordByDate = mock.fn(
      async (input: Record<string, unknown>) => ({
        id: "r-new",
        telegramId: input["telegramId"],
        workDate: input["workDate"],
        recordType: input["recordType"],
        startTime: input["startTime"],
        expectedEndTime: input["expectedEndTime"],
        endTime: input["endTime"],
        workedMinutes: input["workedMinutes"],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
    mockGetSettingsOrThrow = mock.fn(async () => SETTINGS);

    // ── Repository stub ───────────────────────────────────────────────────────
    const repoKey = require.resolve(
      path.join(__dirname, "../repositories/DailyRecordRepository")
    );
    injectCacheStub(repoKey, {
      findRecordByDate:   mockFindRecordByDate,
      updateDailyRecord:  mockUpdateDailyRecord,
      upsertRecordByDate: mockUpsertRecordByDate,
    });

    // ── SettingsService stub ──────────────────────────────────────────────────
    const settingsKey = require.resolve(
      path.join(__dirname, "./SettingsService")
    );
    injectCacheStub(settingsKey, {
      getSettingsOrThrow: mockGetSettingsOrThrow,
    });

    // ── DateUtils stub — keep all real except resolveDdMmToDate ───────────────
    const dateUtilsKey = require.resolve(
      path.join(__dirname, "../utils/DateUtils")
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const realDateUtils = require(dateUtilsKey) as typeof import("../utils/DateUtils");
    injectCacheStub(dateUtilsKey, {
      getLocalDate:       realDateUtils.getLocalDate,
      utcToLocalDate:     realDateUtils.utcToLocalDate,
      utcToLocalTime:     realDateUtils.utcToLocalTime,
      addMinutesUtc:      realDateUtils.addMinutesUtc,
      minutesBetween:     realDateUtils.minutesBetween,
      manualEndTimeToUtc: realDateUtils.manualEndTimeToUtc,
      localTimeToUtc:     realDateUtils.localTimeToUtc,
      resolveDdMmToDate:  () => FIXED_DATE, // deterministic, avoids year dependency
    });

    // Evict TimeCalculationService so it re-loads against the fresh DateUtils stub
    const timeSvcKey = require.resolve(
      path.join(__dirname, "./TimeCalculationService")
    );
    delete require.cache[timeSvcKey];

    // ── Load EditWorkdayService fresh ─────────────────────────────────────────
    const svcKey = require.resolve(
      path.join(__dirname, "./EditWorkdayService")
    );
    delete require.cache[svcKey];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const svc = require(svcKey) as typeof import("./EditWorkdayService");
    getEditDayOptions   = svc.getEditDayOptions;
    assertActionAllowed = svc.assertActionAllowed;
    setEndHour          = svc.setEndHour;
    setStartAndEndHours = svc.setStartAndEndHours;
    markAbsence         = svc.markAbsence;
  });

  afterEach(() => {
    mockFindRecordByDate?.mock.resetCalls();
    mockUpdateDailyRecord?.mock.resetCalls();
    mockUpsertRecordByDate?.mock.resetCalls();
    mockGetSettingsOrThrow?.mock.resetCalls();
  });

  // ── assertActionAllowed ───────────────────────────────────────────────────────

  describe("assertActionAllowed – allowed pairs", () => {
    it("does not throw for SET_END_HOUR on OPEN_WORK_RECORD", () => {
      assert.doesNotThrow(() =>
        assertActionAllowed("OPEN_WORK_RECORD", "SET_END_HOUR")
      );
    });

    it("does not throw for SET_START_AND_END_HOURS on any state", () => {
      for (const state of ["OPEN_WORK_RECORD", "NO_RECORD", "CLOSED_WORK_RECORD", "ABSENCE_RECORD"]) {
        assert.doesNotThrow(() =>
          assertActionAllowed(state, "SET_START_AND_END_HOURS")
        );
      }
    });

    it("does not throw for MARK_ABSENCE on any state", () => {
      for (const state of ["OPEN_WORK_RECORD", "NO_RECORD", "CLOSED_WORK_RECORD", "ABSENCE_RECORD"]) {
        assert.doesNotThrow(() => assertActionAllowed(state, "MARK_ABSENCE"));
      }
    });
  });

  describe("assertActionAllowed – disallowed pairs", () => {
    it("throws CONFLICT for SET_END_HOUR on NO_RECORD", () => {
      assert.throws(
        () => assertActionAllowed("NO_RECORD", "SET_END_HOUR"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "CONFLICT");
          return true;
        }
      );
    });

    it("throws CONFLICT for SET_END_HOUR on CLOSED_WORK_RECORD", () => {
      assert.throws(
        () => assertActionAllowed("CLOSED_WORK_RECORD", "SET_END_HOUR"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "CONFLICT");
          return true;
        }
      );
    });

    it("throws CONFLICT for CANCEL on NO_RECORD (not in allowed list)", () => {
      assert.throws(
        () => assertActionAllowed("NO_RECORD", "CANCEL"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "CONFLICT");
          return true;
        }
      );
    });
  });

  // ── getEditDayOptions – state resolution ──────────────────────────────────────

  describe("getEditDayOptions – NO_RECORD", () => {
    it("returns NO_RECORD state when no record exists for the date", async () => {
      const opts = await getEditDayOptions("user1", "12-06");
      assert.equal(opts.state, "NO_RECORD");
      assert.equal(opts.record, null);
    });

    it("sets allowedActions to [SET_START_AND_END_HOURS, MARK_ABSENCE] for NO_RECORD", async () => {
      const opts = await getEditDayOptions("user1", "12-06");
      assert.ok(opts.allowedActions.includes("SET_START_AND_END_HOURS"));
      assert.ok(opts.allowedActions.includes("MARK_ABSENCE"));
      assert.ok(!opts.allowedActions.includes("SET_END_HOUR"));
      assert.ok(!opts.allowedActions.includes("CANCEL"));
    });
  });

  describe("getEditDayOptions – OPEN_WORK_RECORD", () => {
    it("returns OPEN_WORK_RECORD when a WORK record has no endTime", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(false));
      const opts = await getEditDayOptions("user1", "12-06");
      assert.equal(opts.state, "OPEN_WORK_RECORD");
    });

    it("includes SET_END_HOUR and CANCEL in allowedActions for OPEN_WORK_RECORD", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(false));
      const opts = await getEditDayOptions("user1", "12-06");
      assert.ok(opts.allowedActions.includes("SET_END_HOUR"));
      assert.ok(opts.allowedActions.includes("CANCEL"));
    });
  });

  describe("getEditDayOptions – CLOSED_WORK_RECORD", () => {
    it("returns CLOSED_WORK_RECORD when a WORK record has an endTime", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(true));
      const opts = await getEditDayOptions("user1", "12-06");
      assert.equal(opts.state, "CLOSED_WORK_RECORD");
    });

    it("does not include SET_END_HOUR for CLOSED_WORK_RECORD", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(true));
      const opts = await getEditDayOptions("user1", "12-06");
      assert.ok(!opts.allowedActions.includes("SET_END_HOUR"));
    });
  });

  describe("getEditDayOptions – ABSENCE_RECORD", () => {
    it("returns ABSENCE_RECORD for a SICK record", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("SICK", DAILY_MIN)
      );
      const opts = await getEditDayOptions("user1", "12-06");
      assert.equal(opts.state, "ABSENCE_RECORD");
    });

    it("preserves the absence record in opts.record", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN)
      );
      const opts = await getEditDayOptions("user1", "12-06");
      assert.ok(opts.record !== null);
      assert.equal(opts.record!.recordType, "VACATION");
    });
  });

  describe("getEditDayOptions – displayDate", () => {
    it("sets displayDate to the original dd-mm argument", async () => {
      const opts = await getEditDayOptions("user1", "12-06");
      assert.equal(opts.displayDate, "12-06");
    });
  });

  // ── setEndHour ────────────────────────────────────────────────────────────────

  describe("setEndHour – happy path", () => {
    it("returns correct workedMinutes (startTime 06:00 UTC → endTime 17:00 Jerusalem = 14:00 UTC = 8 h)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(false));
      mockUpdateDailyRecord.mock.mockImplementationOnce(
        async (_id: string, updates: Record<string, unknown>) => ({
          ...makeWorkRecord(false),
          ...updates,
        })
      );

      const result = await setEndHour("user1", "12-06", "17:00");

      assert.equal(result.displayDate, "12-06");
      assert.equal(result.workedMinutes, DAILY_MIN); // 480 min
      assert.equal(result.requiredMinutes, DAILY_MIN);
      assert.equal(result.balanceMinutes, 0);
    });

    it("calls updateDailyRecord exactly once with a non-null endTime", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(false));
      await setEndHour("user1", "12-06", "17:00");
      assert.equal(mockUpdateDailyRecord.mock.calls.length, 1);
      const updateArg = mockUpdateDailyRecord.mock.calls[0].arguments[1];
      assert.ok(updateArg.endTime instanceof Date);
    });

    it("does not call upsertRecordByDate", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(false));
      await setEndHour("user1", "12-06", "17:00");
      assert.equal(mockUpsertRecordByDate.mock.calls.length, 0);
    });
  });

  describe("setEndHour – guards", () => {
    it("throws CONFLICT when state is NO_RECORD", async () => {
      // default mock returns null → NO_RECORD
      await assert.rejects(
        () => setEndHour("user1", "12-06", "17:00"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "CONFLICT");
          return true;
        }
      );
    });

    it("throws CONFLICT when state is CLOSED_WORK_RECORD", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(true));
      await assert.rejects(
        () => setEndHour("user1", "12-06", "17:00"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "CONFLICT");
          return true;
        }
      );
    });
  });

  // ── setStartAndEndHours ───────────────────────────────────────────────────────

  describe("setStartAndEndHours – happy path", () => {
    it("creates a WORK record with correct workedMinutes (08:00–16:00 Jerusalem = 8 h)", async () => {
      // NO_RECORD state (default)
      const result = await setStartAndEndHours("user1", "12-06", "08:00", "16:00");
      assert.equal(result.recordType, "WORK");
      assert.equal(result.workedMinutes, DAILY_MIN); // 480 min
    });

    it("calls upsertRecordByDate exactly once", async () => {
      await setStartAndEndHours("user1", "12-06", "08:00", "16:00");
      assert.equal(mockUpsertRecordByDate.mock.calls.length, 1);
    });

    it("upserts with non-null startTime and endTime", async () => {
      await setStartAndEndHours("user1", "12-06", "08:00", "16:00");
      const arg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.ok(arg.startTime instanceof Date);
      assert.ok(arg.endTime instanceof Date);
    });

    it("is allowed when existing record is OPEN_WORK_RECORD (replaces it)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(false));
      const result = await setStartAndEndHours("user1", "12-06", "08:00", "16:00");
      assert.equal(result.recordType, "WORK");
    });

    it("is allowed when existing record is CLOSED_WORK_RECORD (replaces it)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(true));
      const result = await setStartAndEndHours("user1", "12-06", "08:00", "16:00");
      assert.equal(result.recordType, "WORK");
    });
  });

  // ── markAbsence ───────────────────────────────────────────────────────────────

  describe("markAbsence – credited minutes (dailyRequiredMinutes = 480)", () => {
    it("credits SICK as full day (480 min) with zero balance at the day level", async () => {
      const result = await markAbsence("user1", "12-06", "SICK");
      assert.equal(result.workedMinutes, DAILY_MIN);
      assert.equal(result.balanceMinutes, 0); // 480 - 480 = 0
    });

    it("credits VACATION as full day", async () => {
      const result = await markAbsence("user1", "12-06", "VACATION");
      assert.equal(result.workedMinutes, DAILY_MIN);
    });

    it("credits HOLIDAY as full day", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY");
      assert.equal(result.workedMinutes, DAILY_MIN);
    });

    it("credits ELECTION as full day", async () => {
      const result = await markAbsence("user1", "12-06", "ELECTION");
      assert.equal(result.workedMinutes, DAILY_MIN);
    });

    it("credits HOLIDAY_EVE as half day = floor(480 / 2) = 240 min", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY_EVE");
      assert.equal(result.workedMinutes, Math.floor(DAILY_MIN / 2)); // 240
      assert.equal(result.balanceMinutes, Math.floor(DAILY_MIN / 2) - DAILY_MIN); // -240
    });

    it("credits UNPAID_ABSENCE as 0 min", async () => {
      const result = await markAbsence("user1", "12-06", "UNPAID_ABSENCE");
      assert.equal(result.workedMinutes, 0);
      assert.equal(result.balanceMinutes, -DAILY_MIN); // 0 - 480 = -480
    });

    it("sets recordType to the absence type (not WORK)", async () => {
      const result = await markAbsence("user1", "12-06", "SICK");
      assert.equal(result.recordType, "SICK");
    });

    it("stores UNPAID_ABSENCE recordType correctly", async () => {
      const result = await markAbsence("user1", "12-06", "UNPAID_ABSENCE");
      assert.equal(result.recordType, "UNPAID_ABSENCE");
    });
  });

  describe("markAbsence – record shape", () => {
    it("calls upsertRecordByDate with null timestamps (no clock-in/out)", async () => {
      await markAbsence("user1", "12-06", "SICK");
      const arg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.equal(arg.startTime, null);
      assert.equal(arg.expectedEndTime, null);
      assert.equal(arg.endTime, null);
    });

    it("calls upsertRecordByDate exactly once", async () => {
      await markAbsence("user1", "12-06", "VACATION");
      assert.equal(mockUpsertRecordByDate.mock.calls.length, 1);
    });

    it("is allowed on an existing CLOSED_WORK_RECORD (replaces it with absence)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(true));
      const result = await markAbsence("user1", "12-06", "SICK");
      assert.equal(result.recordType, "SICK");
    });

    it("is allowed on an existing ABSENCE_RECORD (changes absence type)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN)
      );
      const result = await markAbsence("user1", "12-06", "SICK");
      assert.equal(result.recordType, "SICK");
    });
  });
});
