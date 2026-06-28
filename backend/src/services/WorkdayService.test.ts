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

const FIXED_TODAY = "2026-06-13";
const FIXED_TIMEZONE = "Asia/Jerusalem";

const SETTINGS = {
  id: "s1",
  telegramId: "user1",
  dailyRequiredMinutes: 480,
  timezone: FIXED_TIMEZONE,
  workdays: [0, 1, 2, 3, 4],
  createdAt: new Date(),
  updatedAt: new Date(),
};

// workDate stored as UTC midnight — utcToLocalDate("2026-06-13T00:00:00Z", "Asia/Jerusalem") = "2026-06-13"
const TODAY_WORK_DATE = new Date("2026-06-13T00:00:00Z");
const PREV_WORK_DATE = new Date("2026-06-12T00:00:00Z");
const START_1H_AGO = new Date(Date.now() - 60 * 60 * 1000);
const START_10H_AGO = new Date(Date.now() - 10 * 60 * 60 * 1000);

function makeTodayOpenRecord(startTime = START_1H_AGO) {
  return {
    id: "r1",
    telegramId: "user1",
    workDate: TODAY_WORK_DATE,
    startTime,
    expectedEndTime: new Date(startTime.getTime() + 480 * 60 * 1000),
    endTime: null,
    workedMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makePrevDayOpenRecord() {
  return {
    ...makeTodayOpenRecord(new Date(Date.now() - 26 * 60 * 60 * 1000)),
    workDate: PREV_WORK_DATE,
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe("WorkdayService", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let startWorkday: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getTodayStatus: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let endWorkday: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getDateRecord: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockFindOpenRecord: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockFindRecordByDate: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCreateDailyRecord: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockUpdateDailyRecord: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockGetSettingsOrThrow: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockGetLocalDate: ReturnType<typeof mock.fn<any>>;

  let realResolveDdMmToDate: (ddMm: string, tz: string) => string;

  before(() => {
    // Default mock implementations (overridden per-test with mockImplementationOnce)
    mockFindOpenRecord = mock.fn(async () => null);
    mockFindRecordByDate = mock.fn(async () => null);
    mockCreateDailyRecord = mock.fn(async (input: Record<string, unknown>) => ({
      id: "r-new",
      telegramId: input["telegramId"],
      workDate: input["workDate"],
      startTime: input["startTime"],
      expectedEndTime: input["expectedEndTime"],
      endTime: null,
      workedMinutes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockUpdateDailyRecord = mock.fn(
      async (id: string, input: { endTime: Date; workedMinutes: number }) => ({
        id,
        telegramId: "user1",
        workDate: TODAY_WORK_DATE,
        startTime: START_1H_AGO,
        expectedEndTime: new Date(START_1H_AGO.getTime() + 480 * 60 * 1000),
        endTime: input.endTime,
        workedMinutes: input.workedMinutes,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
    mockGetSettingsOrThrow = mock.fn(async () => SETTINGS);
    mockGetLocalDate = mock.fn(() => FIXED_TODAY);

    // Inject repository stub
    const repoKey = require.resolve(
      path.join(__dirname, "../repositories/DailyRecordRepository")
    );
    injectCacheStub(repoKey, {
      findOpenRecord: mockFindOpenRecord,
      findRecordByDate: mockFindRecordByDate,
      createDailyRecord: mockCreateDailyRecord,
      updateDailyRecord: mockUpdateDailyRecord,
      listRecordsByRange: mock.fn(async () => []),
    });

    // Inject SettingsService stub (same directory)
    const settingsKey = require.resolve(
      path.join(__dirname, "./SettingsService")
    );
    injectCacheStub(settingsKey, {
      getSettingsOrThrow: mockGetSettingsOrThrow,
    });

    // Inject DateUtils stub — only override getLocalDate; keep real implementations
    const dateUtilsKey = require.resolve(
      path.join(__dirname, "../utils/DateUtils")
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const realDateUtils = require(dateUtilsKey) as typeof import("../utils/DateUtils");
    realResolveDdMmToDate = realDateUtils.resolveDdMmToDate;
    injectCacheStub(dateUtilsKey, {
      getLocalDate: mockGetLocalDate,
      utcToLocalDate: realDateUtils.utcToLocalDate,
      utcToLocalTime: realDateUtils.utcToLocalTime,
      resolveDdMmToDate: realDateUtils.resolveDdMmToDate,
      manualEndTimeToUtc: realDateUtils.manualEndTimeToUtc,
      addMinutesUtc: realDateUtils.addMinutesUtc,
      minutesBetween: realDateUtils.minutesBetween,
    });

    // Load WorkdayService fresh after all stubs are in place
    const svcKey = require.resolve(path.join(__dirname, "./WorkdayService"));
    delete require.cache[svcKey];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const svc = require(svcKey) as typeof import("./WorkdayService");
    startWorkday = svc.startWorkday;
    getTodayStatus = svc.getTodayStatus;
    endWorkday = svc.endWorkday;
    getDateRecord = svc.getDateRecord;
  });

  afterEach(() => {
    mockFindOpenRecord?.mock.resetCalls();
    mockFindRecordByDate?.mock.resetCalls();
    mockCreateDailyRecord?.mock.resetCalls();
    mockUpdateDailyRecord?.mock.resetCalls();
    mockGetSettingsOrThrow?.mock.resetCalls();
    mockGetLocalDate?.mock.resetCalls();
  });

  // ── startWorkday ─────────────────────────────────────────────────────────────

  describe("startWorkday – happy path", () => {
    it("creates a new record with the correct telegramId and workDate", async () => {
      const record = await startWorkday("user1");

      assert.equal(mockCreateDailyRecord.mock.calls.length, 1);
      const arg = mockCreateDailyRecord.mock.calls[0].arguments[0];
      assert.equal(arg.telegramId, "user1");
      assert.equal(record.telegramId, "user1");
    });

    it("sets expectedEndTime = startTime + dailyRequiredMinutes", async () => {
      await startWorkday("user1");

      const arg = mockCreateDailyRecord.mock.calls[0].arguments[0];
      const diffMs =
        arg.expectedEndTime.getTime() - arg.startTime.getTime();
      const diffMin = Math.round(diffMs / 60_000);
      assert.equal(diffMin, SETTINGS.dailyRequiredMinutes);
    });

    it("passes recordType = WORK to createDailyRecord", async () => {
      await startWorkday("user1");

      const arg = mockCreateDailyRecord.mock.calls[0].arguments[0];
      assert.equal(arg.recordType, "WORK");
    });

    it("does not create a record when one already exists for today (open)", async () => {
      mockFindOpenRecord.mock.mockImplementationOnce(
        async () => makeTodayOpenRecord()
      );

      await assert.rejects(() => startWorkday("user1"), (err: unknown) => {
        assert.equal(
          (err as { code: string }).code,
          "DAILY_RECORD_ALREADY_EXISTS"
        );
        return true;
      });
      assert.equal(mockCreateDailyRecord.mock.calls.length, 0);
    });
  });

  describe("startWorkday – PREVIOUS_RECORD_STILL_OPEN guard", () => {
    it("throws when an open record exists from a previous local date", async () => {
      mockFindOpenRecord.mock.mockImplementationOnce(
        async () => makePrevDayOpenRecord()
      );

      await assert.rejects(() => startWorkday("user1"), (err: unknown) => {
        assert.equal(
          (err as { code: string }).code,
          "PREVIOUS_RECORD_STILL_OPEN"
        );
        return true;
      });
    });
  });

  describe("startWorkday – DAILY_RECORD_ALREADY_EXISTS (closed today)", () => {
    it("throws when today has a closed record (no open record)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(
        async () => ({ ...makeTodayOpenRecord(), endTime: new Date(), workedMinutes: 60 })
      );

      await assert.rejects(() => startWorkday("user1"), (err: unknown) => {
        assert.equal(
          (err as { code: string }).code,
          "DAILY_RECORD_ALREADY_EXISTS"
        );
        return true;
      });
    });
  });

  // ── getTodayStatus ────────────────────────────────────────────────────────────

  describe("getTodayStatus – happy path", () => {
    it("returns WorkdayStatus with isActive:true for today's open record", async () => {
      mockFindOpenRecord.mock.mockImplementationOnce(
        async () => makeTodayOpenRecord()
      );

      const status = await getTodayStatus("user1");

      assert.equal(status.workDate, FIXED_TODAY);
      assert.equal(status.isActive, true);
      assert.ok(typeof status.workedMinutesSoFar === "number");
      assert.ok(status.workedMinutesSoFar >= 0);
    });

    it("clamps remainingMinutes to 0 when the user has already exceeded required hours", async () => {
      // startTime 10 hours ago → workedMinutesSoFar ≈ 600 > dailyRequiredMinutes (480)
      mockFindOpenRecord.mock.mockImplementationOnce(
        async () => makeTodayOpenRecord(START_10H_AGO)
      );

      const status = await getTodayStatus("user1");

      assert.equal(status.remainingMinutes, 0);
    });
  });

  describe("getTodayStatus – guards", () => {
    it("throws ACTIVE_RECORD_NOT_FOUND when no open record exists", async () => {
      await assert.rejects(() => getTodayStatus("user1"), (err: unknown) => {
        assert.equal(
          (err as { code: string }).code,
          "ACTIVE_RECORD_NOT_FOUND"
        );
        return true;
      });
    });

    it("throws PREVIOUS_RECORD_STILL_OPEN when open record is from a prior date", async () => {
      mockFindOpenRecord.mock.mockImplementationOnce(
        async () => makePrevDayOpenRecord()
      );

      await assert.rejects(() => getTodayStatus("user1"), (err: unknown) => {
        assert.equal(
          (err as { code: string }).code,
          "PREVIOUS_RECORD_STILL_OPEN"
        );
        return true;
      });
    });
  });

  // ── endWorkday (today) ────────────────────────────────────────────────────────

  describe("endWorkday – today happy path", () => {
    it("closes the active record and returns EndWorkdayResult", async () => {
      mockFindOpenRecord.mock.mockImplementationOnce(
        async () => makeTodayOpenRecord()
      );

      const result = await endWorkday("user1");

      assert.equal(result.telegramId, "user1");
      assert.equal(result.workDate, FIXED_TODAY);
      assert.equal(result.requiredMinutes, SETTINGS.dailyRequiredMinutes);
      assert.ok(typeof result.workedMinutes === "number");
      assert.ok(result.workedMinutes >= 0);
      assert.equal(
        result.balanceMinutes,
        result.workedMinutes - result.requiredMinutes
      );
    });

    it("calls updateDailyRecord exactly once with a non-null endTime", async () => {
      mockFindOpenRecord.mock.mockImplementationOnce(
        async () => makeTodayOpenRecord()
      );

      await endWorkday("user1");

      assert.equal(mockUpdateDailyRecord.mock.calls.length, 1);
      const updateArg = mockUpdateDailyRecord.mock.calls[0].arguments[1];
      assert.ok(updateArg.endTime instanceof Date);
    });
  });

  describe("endWorkday – today guards", () => {
    it("throws ACTIVE_RECORD_NOT_FOUND when no open or closed record exists", async () => {
      await assert.rejects(() => endWorkday("user1"), (err: unknown) => {
        assert.equal(
          (err as { code: string }).code,
          "ACTIVE_RECORD_NOT_FOUND"
        );
        return true;
      });
    });

    it("throws DAILY_RECORD_ALREADY_CLOSED when today's record is already closed", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(
        async () => ({
          ...makeTodayOpenRecord(),
          endTime: new Date(),
          workedMinutes: 60,
        })
      );

      await assert.rejects(() => endWorkday("user1"), (err: unknown) => {
        assert.equal(
          (err as { code: string }).code,
          "DAILY_RECORD_ALREADY_CLOSED"
        );
        return true;
      });
    });
  });

  // ── getDateRecord – helpers ───────────────────────────────────────────────────

  function makeCompletedWorkRecord() {
    const start = new Date("2026-06-12T06:00:00Z");
    return {
      id: "r-completed",
      telegramId: "user1",
      workDate: PREV_WORK_DATE,
      recordType: "WORK",
      startTime: start,
      expectedEndTime: new Date(start.getTime() + 480 * 60_000),
      endTime: new Date("2026-06-12T14:30:00Z"),
      workedMinutes: 510,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  function makeOpenWorkRecordForDate() {
    const start = new Date("2026-06-12T06:00:00Z");
    return {
      id: "r-open-date",
      telegramId: "user1",
      workDate: PREV_WORK_DATE,
      recordType: "WORK",
      startTime: start,
      expectedEndTime: new Date(start.getTime() + 480 * 60_000),
      endTime: null,
      workedMinutes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  function makeVacationRecord() {
    return {
      id: "r-vacation",
      telegramId: "user1",
      workDate: PREV_WORK_DATE,
      recordType: "VACATION",
      startTime: null,
      expectedEndTime: null,
      endTime: null,
      workedMinutes: SETTINGS.dailyRequiredMinutes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ── endWorkday – previous-day guard ──────────────────────────────────────────

  describe("endWorkday – previous-day guard", () => {
    it("throws PREVIOUS_RECORD_STILL_OPEN when open record is from a prior date", async () => {
      mockFindOpenRecord.mock.mockImplementationOnce(
        async () => makePrevDayOpenRecord()
      );

      await assert.rejects(
        () => endWorkday("user1"),
        (err: unknown) => {
          assert.equal(
            (err as { code: string }).code,
            "PREVIOUS_RECORD_STILL_OPEN"
          );
          return true;
        }
      );
      assert.equal(mockUpdateDailyRecord.mock.calls.length, 0);
    });
  });

  // ── getDateRecord ─────────────────────────────────────────────────────────────

  describe("getDateRecord – state classification", () => {
    it("returns state=COMPLETED_WORK_RECORD for a closed WORK record", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(
        async () => makeCompletedWorkRecord()
      );

      const result = await getDateRecord("user1", "12-06");

      assert.equal(result.state, "COMPLETED_WORK_RECORD");
      assert.equal(result.displayDate, "12-06");
      assert.ok(result.record !== null);
      assert.equal(result.record.recordType, "WORK");
      assert.ok(result.record.endTime !== null);
      assert.equal(result.record.workedMinutes, 510);
    });

    it("returns state=OPEN_WORK_RECORD for a WORK record without endTime", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(
        async () => makeOpenWorkRecordForDate()
      );

      const result = await getDateRecord("user1", "12-06");

      assert.equal(result.state, "OPEN_WORK_RECORD");
      assert.ok(result.record !== null);
      assert.equal(result.record.endTime, null);
      assert.equal(result.record.workedMinutes, null);
    });

    it("returns state=ABSENCE_RECORD for an absence record", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(
        async () => makeVacationRecord()
      );

      const result = await getDateRecord("user1", "12-06");

      assert.equal(result.state, "ABSENCE_RECORD");
      assert.ok(result.record !== null);
      assert.equal(result.record.recordType, "VACATION");
      assert.equal(result.record.workedMinutes, SETTINGS.dailyRequiredMinutes);
    });

    it("returns state=NO_RECORD with record=null when no record exists", async () => {
      const result = await getDateRecord("user1", "12-06");

      assert.equal(result.state, "NO_RECORD");
      assert.equal(result.record, null);
    });

    it("resolves dd-mm to the correct workDate and passes the matching UTC Date to findRecordByDate", async () => {
      const ddMm = "12-06";
      const expectedWorkDate = realResolveDdMmToDate(ddMm, SETTINGS.timezone);
      const expectedUtcDate = new Date(`${expectedWorkDate}T00:00:00.000Z`);

      const result = await getDateRecord("user1", ddMm);

      assert.equal(result.workDate, expectedWorkDate);
      assert.equal(result.displayDate, ddMm);
      assert.equal(result.timezone, SETTINGS.timezone);

      assert.equal(mockFindRecordByDate.mock.calls.length, 1);
      const passedDate = mockFindRecordByDate.mock.calls[0].arguments[1] as Date;
      assert.equal(passedDate.toISOString(), expectedUtcDate.toISOString());
    });
  });

  describe("getDateRecord – guards", () => {
    it("throws USER_SETTINGS_NOT_FOUND when settings are missing", async () => {
      mockGetSettingsOrThrow.mock.mockImplementationOnce(async () => {
        throw Object.assign(new Error("No settings"), {
          code: "USER_SETTINGS_NOT_FOUND",
        });
      });

      await assert.rejects(() => getDateRecord("user1", "12-06"), (err: unknown) => {
        assert.equal((err as { code: string }).code, "USER_SETTINGS_NOT_FOUND");
        return true;
      });
    });

    it("does not call findRecordByDate when settings are missing", async () => {
      mockGetSettingsOrThrow.mock.mockImplementationOnce(async () => {
        throw Object.assign(new Error("No settings"), {
          code: "USER_SETTINGS_NOT_FOUND",
        });
      });

      await assert.rejects(() => getDateRecord("user1", "12-06"));
      assert.equal(mockFindRecordByDate.mock.calls.length, 0);
    });
  });
});
