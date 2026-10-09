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
  cholHamoedRequiredMinutes: null as number | null,
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
    recordType: "WORK",
    absencePortion: null,
    startTime,
    expectedEndTime: new Date(startTime.getTime() + 480 * 60 * 1000),
    endTime: null,
    workedMinutes: null,
    creditedMinutes: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makePeriod(startTime: Date, endTime: Date | null, id = "p1") {
  return {
    id,
    dailyRecordId: "r1",
    startTime,
    endTime,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const MIN = 60_000;

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
  let mockFindOpenWorkRecord: ReturnType<typeof mock.fn<any>>;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockListWorkPeriods: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCreateWorkPeriod: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockUpdateWorkPeriod: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockTransaction: ReturnType<typeof mock.fn<any>>;

  // Distinguishable marker so tests can assert the writes inside a
  // transaction received the same `tx` handle passed to prisma.$transaction().
  const FAKE_TX = { __fakeTx: true };

  let realResolveDdMmToDate: (ddMm: string, tz: string) => string;

  before(() => {
    // Default mock implementations (overridden per-test with mockImplementationOnce)
    mockFindOpenWorkRecord = mock.fn(async () => null);
    mockFindRecordByDate = mock.fn(async () => null);
    mockCreateDailyRecord = mock.fn(async (input: Record<string, unknown>) => ({
      id: "r-new",
      telegramId: input["telegramId"],
      workDate: input["workDate"],
      recordType: "WORK",
      absencePortion: null,
      startTime: input["startTime"],
      expectedEndTime: input["expectedEndTime"],
      endTime: null,
      workedMinutes: null,
      creditedMinutes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockUpdateDailyRecord = mock.fn(
      async (id: string, input: { endTime: Date; workedMinutes: number }) => ({
        id,
        telegramId: "user1",
        workDate: TODAY_WORK_DATE,
        recordType: "WORK",
        absencePortion: null,
        startTime: START_1H_AGO,
        expectedEndTime: new Date(START_1H_AGO.getTime() + 480 * 60 * 1000),
        endTime: input.endTime,
        workedMinutes: input.workedMinutes,
        creditedMinutes: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
    mockGetSettingsOrThrow = mock.fn(async () => SETTINGS);
    mockGetLocalDate = mock.fn(() => FIXED_TODAY);
    // Default: today's single open period, matching makeTodayOpenRecord().
    mockListWorkPeriods = mock.fn(async () => [makePeriod(START_1H_AGO, null)]);
    mockCreateWorkPeriod = mock.fn(
      async (input: { dailyRecordId: string; startTime: Date }) => ({
        ...makePeriod(input.startTime, null, "p-new"),
        dailyRecordId: input.dailyRecordId,
      })
    );
    mockUpdateWorkPeriod = mock.fn(async (id: string, input: Record<string, unknown>) => ({
      ...makePeriod(START_1H_AGO, null, id),
      ...input,
    }));
    mockTransaction = mock.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(FAKE_TX));

    // Inject PrismaClient stub (start/end write inside prisma.$transaction) —
    // avoids loading the real client, which validates env vars.
    const prismaClientKey = require.resolve(
      path.join(__dirname, "../config/PrismaClient")
    );
    injectCacheStub(prismaClientKey, {
      prisma: { $transaction: mockTransaction },
    });

    // Inject work period repository stub
    const periodRepoKey = require.resolve(
      path.join(__dirname, "../repositories/WorkPeriodRepository")
    );
    injectCacheStub(periodRepoKey, {
      listWorkPeriods: mockListWorkPeriods,
      createWorkPeriod: mockCreateWorkPeriod,
      updateWorkPeriod: mockUpdateWorkPeriod,
    });

    // Inject repository stub
    const repoKey = require.resolve(
      path.join(__dirname, "../repositories/DailyRecordRepository")
    );
    injectCacheStub(repoKey, {
      findOpenWorkRecord: mockFindOpenWorkRecord,
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
      localDateToUtcMidnight: realDateUtils.localDateToUtcMidnight,
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
    mockFindOpenWorkRecord?.mock.resetCalls();
    mockFindRecordByDate?.mock.resetCalls();
    mockCreateDailyRecord?.mock.resetCalls();
    mockUpdateDailyRecord?.mock.resetCalls();
    mockGetSettingsOrThrow?.mock.resetCalls();
    mockGetLocalDate?.mock.resetCalls();
    mockListWorkPeriods?.mock.resetCalls();
    mockCreateWorkPeriod?.mock.resetCalls();
    mockUpdateWorkPeriod?.mock.resetCalls();
    mockTransaction?.mock.resetCalls();
  });

  // ── startWorkday ─────────────────────────────────────────────────────────────

  describe("startWorkday – happy path", () => {
    it("creates a new record with the correct telegramId and workDate", async () => {
      const { record } = await startWorkday("user1");

      assert.equal(mockCreateDailyRecord.mock.calls.length, 1);
      const arg = mockCreateDailyRecord.mock.calls[0].arguments[0];
      assert.equal(arg.telegramId, "user1");
      assert.equal(record.telegramId, "user1");
    });

    it("opens period 1 on the new record, in the same transaction", async () => {
      const result = await startWorkday("user1");

      assert.equal(mockTransaction.mock.calls.length, 1);
      assert.equal(mockCreateDailyRecord.mock.calls[0].arguments[1], FAKE_TX);
      assert.equal(mockCreateWorkPeriod.mock.calls.length, 1);
      const [periodInput, periodClient] = mockCreateWorkPeriod.mock.calls[0].arguments;
      assert.equal(periodInput.dailyRecordId, "r-new");
      assert.equal(periodClient, FAKE_TX);
      assert.equal(
        periodInput.startTime.getTime(),
        mockCreateDailyRecord.mock.calls[0].arguments[0].startTime.getTime()
      );
      assert.equal(result.periods.length, 1);
      assert.equal(result.periods[0].endTime, null);
      assert.equal(result.workedMinutesSoFar, 0);
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
      mockFindOpenWorkRecord.mock.mockImplementationOnce(
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
      mockFindOpenWorkRecord.mock.mockImplementationOnce(
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

  describe("startWorkday – another period on a closed day", () => {
    // Period 1: 6h ago → 1h ago (300 min), so the day is closed with 300 worked.
    const FIRST_START = new Date(Date.now() - 6 * 60 * MIN);
    const FIRST_END = new Date(Date.now() - 60 * MIN);

    function makeTodayClosedRecord(workedMinutes = 300) {
      return {
        ...makeTodayOpenRecord(FIRST_START),
        endTime: FIRST_END,
        workedMinutes,
      };
    }

    it("opens period 2 on the same record instead of creating a new one", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTodayClosedRecord());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(FIRST_START, FIRST_END),
      ]);
      mockUpdateDailyRecord.mock.mockImplementationOnce(
        async (id: string, input: Record<string, unknown>) => ({
          ...makeTodayClosedRecord(),
          id,
          ...input,
        })
      );

      const result = await startWorkday("user1");

      assert.equal(mockCreateDailyRecord.mock.calls.length, 0);
      assert.equal(mockUpdateDailyRecord.mock.calls.length, 1);
      const [id, input, client] = mockUpdateDailyRecord.mock.calls[0].arguments;
      assert.equal(id, "r1");
      assert.equal(client, FAKE_TX);
      // The record keeps the day's first start and is reopened.
      assert.equal(input.startTime.getTime(), FIRST_START.getTime());
      assert.equal(input.endTime, null);

      assert.equal(mockCreateWorkPeriod.mock.calls.length, 1);
      const [periodInput, periodClient] = mockCreateWorkPeriod.mock.calls[0].arguments;
      assert.equal(periodInput.dailyRecordId, "r1");
      assert.equal(periodClient, FAKE_TX);
      // Expected end covers only what is still missing: 480 - 300 = 180 minutes.
      assert.equal(
        input.expectedEndTime.getTime() - periodInput.startTime.getTime(),
        180 * MIN
      );

      assert.equal(result.workedMinutesSoFar, 300);
      assert.equal(result.periods.length, 2);
      assert.equal(result.periods[0].workedMinutes, 300);
      assert.equal(result.periods[1].endTime, null);
    });

    it("sets expectedEndTime = now when the day's required time is already covered", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTodayClosedRecord(500));
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(FIRST_START, FIRST_END),
      ]);

      await startWorkday("user1");

      const input = mockUpdateDailyRecord.mock.calls[0].arguments[1];
      const periodInput = mockCreateWorkPeriod.mock.calls[0].arguments[0];
      assert.equal(input.expectedEndTime.getTime(), periodInput.startTime.getTime());
    });

    it("throws WORK_PERIOD_LIMIT_REACHED when today already has 4 periods, and writes nothing", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTodayClosedRecord());
      mockListWorkPeriods.mock.mockImplementationOnce(async () =>
        [0, 1, 2, 3].map((i) =>
          makePeriod(
            new Date(FIRST_START.getTime() + i * 60 * MIN),
            new Date(FIRST_START.getTime() + (i * 60 + 30) * MIN),
            `p${i}`
          )
        )
      );

      await assert.rejects(() => startWorkday("user1"), (err: unknown) => {
        assert.equal((err as { code: string }).code, "WORK_PERIOD_LIMIT_REACHED");
        assert.equal((err as { details?: Record<string, unknown> }).details?.["max"], 4);
        return true;
      });
      assert.equal(mockTransaction.mock.calls.length, 0);
      assert.equal(mockUpdateDailyRecord.mock.calls.length, 0);
      assert.equal(mockCreateWorkPeriod.mock.calls.length, 0);
    });
  });

  // ── startWorkday – days already marked as an absence ───────────────────────

  describe("startWorkday – today marked as an absence", () => {
    function makeTodayAbsence(
      recordType: string,
      absencePortion: "FULL" | "HALF",
      creditedMinutes: number
    ) {
      return {
        id: "r-abs",
        telegramId: "user1",
        workDate: TODAY_WORK_DATE,
        recordType,
        absencePortion,
        startTime: null,
        expectedEndTime: null,
        endTime: null,
        workedMinutes: 0,
        creditedMinutes,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    for (const recordType of ["VACATION", "HOLIDAY_EVE"]) {
      it(`starts the session on today's HALF ${recordType} record instead of creating a new one`, async () => {
        mockFindRecordByDate.mock.mockImplementationOnce(
          async () => makeTodayAbsence(recordType, "HALF", 240)
        );
        mockListWorkPeriods.mock.mockImplementationOnce(async () => []);
        mockUpdateDailyRecord.mock.mockImplementationOnce(
          async (id: string, input: Record<string, unknown>) => ({
            ...makeTodayAbsence(recordType, "HALF", 240),
            id,
            ...input,
          })
        );

        const { record, periods } = await startWorkday("user1");

        assert.equal(mockCreateDailyRecord.mock.calls.length, 0);
        assert.equal(mockUpdateDailyRecord.mock.calls.length, 1);
        const [id, input] = mockUpdateDailyRecord.mock.calls[0].arguments;
        assert.equal(id, "r-abs");
        // Only the session fields are written — absence, credit and debit are kept.
        assert.deepEqual(Object.keys(input).sort(), ["endTime", "expectedEndTime", "startTime"]);
        assert.equal(input.endTime, null);
        assert.equal(mockCreateWorkPeriod.mock.calls[0].arguments[0].dailyRecordId, "r-abs");
        assert.equal(periods.length, 1);
        // Expected end covers only the remaining 480 - 240 = 240 minutes.
        assert.equal(
          (input.expectedEndTime as Date).getTime() - (input.startTime as Date).getTime(),
          240 * 60_000
        );
        assert.equal(record.recordType, recordType);
        assert.equal(record.creditedMinutes, 240);
      });
    }

    it("throws DAY_MARKED_AS_ABSENCE for a full-day absence and writes nothing", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(
        async () => makeTodayAbsence("HOLIDAY", "FULL", 480)
      );

      await assert.rejects(() => startWorkday("user1"), (err: unknown) => {
        assert.equal((err as { code: string }).code, "DAY_MARKED_AS_ABSENCE");
        assert.equal(
          (err as { details?: Record<string, unknown> }).details?.["recordType"],
          "HOLIDAY"
        );
        return true;
      });
      assert.equal(mockCreateDailyRecord.mock.calls.length, 0);
      assert.equal(mockUpdateDailyRecord.mock.calls.length, 0);
    });

    it("opens another period on a half day whose hours were already logged", async () => {
      const firstStart = new Date(Date.now() - 4 * 60 * MIN);
      const firstEnd = new Date(Date.now() - 2 * 60 * MIN);
      mockFindRecordByDate.mock.mockImplementationOnce(async () => ({
        ...makeTodayAbsence("VACATION", "HALF", 240),
        startTime: firstStart,
        endTime: firstEnd,
        workedMinutes: 120,
      }));
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(firstStart, firstEnd),
      ]);

      const { periods, workedMinutesSoFar } = await startWorkday("user1");

      const input = mockUpdateDailyRecord.mock.calls[0].arguments[1];
      const periodInput = mockCreateWorkPeriod.mock.calls[0].arguments[0];
      // Still missing: 480 required - 240 credited - 120 worked = 120 minutes.
      assert.equal(
        input.expectedEndTime.getTime() - periodInput.startTime.getTime(),
        120 * MIN
      );
      assert.equal(input.startTime.getTime(), firstStart.getTime());
      assert.equal(workedMinutesSoFar, 120);
      assert.equal(periods.length, 2);
    });
  });

  // ── getTodayStatus ────────────────────────────────────────────────────────────

  describe("getTodayStatus – happy path", () => {
    it("returns WorkdayStatus with isActive:true for today's open record", async () => {
      mockFindOpenWorkRecord.mock.mockImplementationOnce(
        async () => makeTodayOpenRecord()
      );

      const status = await getTodayStatus("user1");

      assert.equal(status.workDate, FIXED_TODAY);
      assert.equal(status.isActive, true);
      assert.equal(status.requiredMinutes, SETTINGS.dailyRequiredMinutes);
      assert.ok(typeof status.workedMinutesSoFar === "number");
      assert.ok(status.workedMinutesSoFar >= 0);
    });

    it("clamps remainingMinutes to 0 when the user has already exceeded required hours", async () => {
      // startTime 10 hours ago → workedMinutesSoFar ≈ 600 > dailyRequiredMinutes (480)
      mockFindOpenWorkRecord.mock.mockImplementationOnce(
        async () => makeTodayOpenRecord(START_10H_AGO)
      );
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(START_10H_AGO, null),
      ]);

      const status = await getTodayStatus("user1");

      assert.equal(status.remainingMinutes, 0);
    });

    it("sums every period of the day, counting the open one up to now", async () => {
      // Period 1: 300 min (closed). Period 2: opened 1h ago.
      const firstStart = new Date(Date.now() - 8 * 60 * MIN);
      const firstEnd = new Date(firstStart.getTime() + 300 * MIN);
      mockFindOpenWorkRecord.mock.mockImplementationOnce(async () => ({
        ...makeTodayOpenRecord(firstStart),
        workedMinutes: 300,
      }));
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(firstStart, firstEnd, "p1"),
        makePeriod(START_1H_AGO, null, "p2"),
      ]);

      const status = await getTodayStatus("user1");

      assert.equal(status.workedMinutesSoFar, 360);
      assert.equal(status.remainingMinutes, 480 - 360);
      assert.equal(status.startTime, firstStart.toISOString());
      assert.deepEqual(
        status.periods.map((p: { workedMinutes: number; endTime: string | null }) => [
          p.workedMinutes,
          p.endTime,
        ]),
        [
          [300, firstEnd.toISOString()],
          [60, null],
        ]
      );
    });

    it("counts credited minutes toward remaining time for an open session on a half-day absence", async () => {
      // 1h worked so far + 240 credited → 480 - 60 - 240 = 180 remaining
      mockFindOpenWorkRecord.mock.mockImplementationOnce(async () => ({
        ...makeTodayOpenRecord(),
        recordType: "VACATION",
        absencePortion: "HALF",
        creditedMinutes: 240,
      }));

      const status = await getTodayStatus("user1");

      assert.equal(status.creditedMinutes, 240);
      assert.equal(status.remainingMinutes, 480 - status.workedMinutesSoFar - 240);
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
      mockFindOpenWorkRecord.mock.mockImplementationOnce(
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
      mockFindOpenWorkRecord.mock.mockImplementationOnce(
        async () => makeTodayOpenRecord()
      );

      const result = await endWorkday("user1");

      assert.equal(result.telegramId, "user1");
      assert.equal(result.workDate, FIXED_TODAY);
      assert.equal(result.requiredMinutes, SETTINGS.dailyRequiredMinutes);
      assert.ok(typeof result.workedMinutes === "number");
      assert.ok(result.workedMinutes >= 0);
      assert.equal(result.creditedMinutes, 0);
      assert.equal(
        result.balanceMinutes,
        result.workedMinutes - result.requiredMinutes
      );
    });

    it("includes credited minutes in the balance when closing a session on a half-day absence", async () => {
      mockFindOpenWorkRecord.mock.mockImplementationOnce(async () => ({
        ...makeTodayOpenRecord(),
        recordType: "VACATION",
        absencePortion: "HALF",
        creditedMinutes: 240,
      }));

      const result = await endWorkday("user1");

      assert.equal(result.creditedMinutes, 240);
      assert.equal(
        result.balanceMinutes,
        result.workedMinutes + 240 - result.requiredMinutes
      );
    });

    it("calls updateDailyRecord exactly once with a non-null endTime", async () => {
      mockFindOpenWorkRecord.mock.mockImplementationOnce(
        async () => makeTodayOpenRecord()
      );

      await endWorkday("user1");

      assert.equal(mockUpdateDailyRecord.mock.calls.length, 1);
      const updateArg = mockUpdateDailyRecord.mock.calls[0].arguments[1];
      assert.ok(updateArg.endTime instanceof Date);
    });

    it("closes only the open period and stores the total of all periods, in one transaction", async () => {
      // Period 1: 300 min (closed). Period 2: opened 1h ago → 60 min at /end.
      const firstStart = new Date(Date.now() - 8 * 60 * MIN);
      const firstEnd = new Date(firstStart.getTime() + 300 * MIN);
      mockFindOpenWorkRecord.mock.mockImplementationOnce(async () => ({
        ...makeTodayOpenRecord(firstStart),
        workedMinutes: 300,
      }));
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(firstStart, firstEnd, "p1"),
        makePeriod(START_1H_AGO, null, "p2"),
      ]);

      const result = await endWorkday("user1");

      assert.equal(mockTransaction.mock.calls.length, 1);
      assert.equal(mockUpdateWorkPeriod.mock.calls.length, 1);
      const [periodId, periodInput, periodClient] = mockUpdateWorkPeriod.mock.calls[0].arguments;
      assert.equal(periodId, "p2");
      assert.equal(periodClient, FAKE_TX);

      const [, recordInput, recordClient] = mockUpdateDailyRecord.mock.calls[0].arguments;
      assert.equal(recordClient, FAKE_TX);
      assert.equal(recordInput.endTime.getTime(), periodInput.endTime.getTime());
      assert.equal(recordInput.workedMinutes, 360);

      assert.equal(result.workedMinutes, 360);
      assert.equal(result.balanceMinutes, 360 - 480);
      assert.equal(result.endTime, periodInput.endTime.toISOString());
      assert.deepEqual(
        result.periods.map((p: { workedMinutes: number }) => p.workedMinutes),
        [300, 60]
      );
      assert.ok(result.periods.every((p: { endTime: string | null }) => p.endTime !== null));
    });

    it("throws ACTIVE_RECORD_NOT_FOUND when the open record has no open period, and writes nothing", async () => {
      mockFindOpenWorkRecord.mock.mockImplementationOnce(async () => makeTodayOpenRecord());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(START_10H_AGO, START_1H_AGO),
      ]);

      await assert.rejects(() => endWorkday("user1"), (err: unknown) => {
        assert.equal((err as { code: string }).code, "ACTIVE_RECORD_NOT_FOUND");
        return true;
      });
      assert.equal(mockTransaction.mock.calls.length, 0);
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
        // Under the period limit — the reply can suggest /start.
        assert.equal(
          (err as { details?: Record<string, unknown> }).details?.["canStartAnotherPeriod"],
          true
        );
        return true;
      });
    });

    it("reports canStartAnotherPeriod=false once today has the maximum number of periods", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => ({
        ...makeTodayOpenRecord(START_10H_AGO),
        endTime: START_1H_AGO,
        workedMinutes: 120,
      }));
      mockListWorkPeriods.mock.mockImplementationOnce(async () =>
        [0, 1, 2, 3].map((i) =>
          makePeriod(
            new Date(START_10H_AGO.getTime() + i * 60 * MIN),
            new Date(START_10H_AGO.getTime() + (i * 60 + 30) * MIN),
            `p${i}`
          )
        )
      );

      await assert.rejects(() => endWorkday("user1"), (err: unknown) => {
        assert.equal((err as { code: string }).code, "DAILY_RECORD_ALREADY_CLOSED");
        assert.equal(
          (err as { details?: Record<string, unknown> }).details?.["canStartAnotherPeriod"],
          false
        );
        return true;
      });
    });

    it("reports canStartAnotherPeriod=false on a full-day absence", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => ({
        ...makeTodayOpenRecord(),
        recordType: "SICK",
        absencePortion: "FULL",
        startTime: null,
        expectedEndTime: null,
        endTime: null,
        workedMinutes: 0,
        creditedMinutes: 480,
      }));

      await assert.rejects(() => endWorkday("user1"), (err: unknown) => {
        assert.equal((err as { code: string }).code, "DAILY_RECORD_ALREADY_CLOSED");
        assert.equal(
          (err as { details?: Record<string, unknown> }).details?.["canStartAnotherPeriod"],
          false
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
      absencePortion: null,
      creditedMinutes: 0,
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
      absencePortion: null,
      creditedMinutes: 0,
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
      absencePortion: "FULL",
      startTime: null,
      expectedEndTime: null,
      endTime: null,
      workedMinutes: 0,
      creditedMinutes: SETTINGS.dailyRequiredMinutes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ── endWorkday – previous-day guard ──────────────────────────────────────────

  describe("endWorkday – previous-day guard", () => {
    it("throws PREVIOUS_RECORD_STILL_OPEN when open record is from a prior date", async () => {
      mockFindOpenWorkRecord.mock.mockImplementationOnce(
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
      assert.equal(result.record.absencePortion, "FULL");
      assert.equal(result.record.creditedMinutes, SETTINGS.dailyRequiredMinutes);
      assert.equal(result.record.workedMinutes, 0);
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

  // ── Chol HaMoed hours ─────────────────────────────────────────────────────────

  describe("Chol HaMoed hours", () => {
    const CHOL_HAMOED_TODAY = "2026-09-28"; // 17 Tishri
    const CHOL_HAMOED_WORK_DATE = new Date(`${CHOL_HAMOED_TODAY}T00:00:00Z`);
    const CH_SETTINGS = { ...SETTINGS, cholHamoedRequiredMinutes: 420 };

    function makeChOpenRecord(overrides: Record<string, unknown> = {}) {
      return { ...makeTodayOpenRecord(), workDate: CHOL_HAMOED_WORK_DATE, ...overrides };
    }

    it("startWorkday sets expectedEndTime = startTime + the Chol HaMoed hours", async () => {
      mockGetLocalDate.mock.mockImplementationOnce(() => CHOL_HAMOED_TODAY);

      await startWorkday("user1", CH_SETTINGS);

      const arg = mockCreateDailyRecord.mock.calls[0].arguments[0];
      assert.equal(Math.round((arg.expectedEndTime.getTime() - arg.startTime.getTime()) / 60_000), 420);
    });

    it("startWorkday uses the normal hours on Chol HaMoed when no override is set", async () => {
      mockGetLocalDate.mock.mockImplementationOnce(() => CHOL_HAMOED_TODAY);

      await startWorkday("user1", SETTINGS);

      const arg = mockCreateDailyRecord.mock.calls[0].arguments[0];
      assert.equal(Math.round((arg.expectedEndTime.getTime() - arg.startTime.getTime()) / 60_000), 480);
    });

    it("startWorkday on a Chol HaMoed half day covers only the Chol HaMoed hours minus the credit", async () => {
      mockGetLocalDate.mock.mockImplementationOnce(() => CHOL_HAMOED_TODAY);
      const halfDay = {
        ...makeChOpenRecord({ startTime: null, expectedEndTime: null }),
        recordType: "VACATION",
        absencePortion: "HALF",
        workedMinutes: 0,
        creditedMinutes: 210,
      };
      mockFindRecordByDate.mock.mockImplementationOnce(async () => halfDay);
      mockUpdateDailyRecord.mock.mockImplementationOnce(
        async (id: string, input: Record<string, unknown>) => ({ ...halfDay, id, ...input })
      );

      await startWorkday("user1", CH_SETTINGS);

      const input = mockUpdateDailyRecord.mock.calls[0].arguments[1];
      assert.equal(
        Math.round((input.expectedEndTime.getTime() - input.startTime.getTime()) / 60_000),
        420 - 210
      );
    });

    it("getTodayStatus returns the Chol HaMoed hours as requiredMinutes", async () => {
      mockGetLocalDate.mock.mockImplementationOnce(() => CHOL_HAMOED_TODAY);
      mockFindOpenWorkRecord.mock.mockImplementationOnce(async () => makeChOpenRecord());

      const status = await getTodayStatus("user1", CH_SETTINGS);

      assert.equal(status.requiredMinutes, 420);
      assert.equal(status.remainingMinutes, 420 - status.workedMinutesSoFar);
    });

    it("endWorkday computes the balance against the Chol HaMoed hours", async () => {
      mockGetLocalDate.mock.mockImplementationOnce(() => CHOL_HAMOED_TODAY);
      mockFindOpenWorkRecord.mock.mockImplementationOnce(async () => makeChOpenRecord());

      const result = await endWorkday("user1", CH_SETTINGS);

      assert.equal(result.requiredMinutes, 420);
      assert.equal(result.balanceMinutes, result.workedMinutes - 420);
    });
  });
});
