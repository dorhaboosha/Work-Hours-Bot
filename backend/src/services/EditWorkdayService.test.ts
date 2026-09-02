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
  vacationAccrualRate: 1,
  sickAccrualRate: 1.5,
  vacationBalance: 10,
  sickBalance: 8,
  accrualAnchorAt: new Date("2026-01-01T00:00:00Z"),
  accrualAppliedThrough: new Date("2026-06-01T00:00:00Z"),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockApplyPendingLeaveAccrual: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDecrementLeaveBalance: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockTransaction: ReturnType<typeof mock.fn<any>>;

  // Distinguishable marker so tests can assert both repo calls inside a
  // transaction received the same `tx` handle passed to prisma.$transaction().
  const FAKE_TX = { __fakeTx: true };

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
    mockApplyPendingLeaveAccrual = mock.fn(async () => SETTINGS);
    mockDecrementLeaveBalance = mock.fn(
      async (_telegramId: string, field: "vacationBalance" | "sickBalance", amount: number) => ({
        ...SETTINGS,
        [field]: (SETTINGS as unknown as Record<string, number>)[field] - amount,
      })
    );
    mockTransaction = mock.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(FAKE_TX)
    );

    // ── Repository stub ───────────────────────────────────────────────────────
    const repoKey = require.resolve(
      path.join(__dirname, "../repositories/DailyRecordRepository")
    );
    injectCacheStub(repoKey, {
      findRecordByDate:   mockFindRecordByDate,
      updateDailyRecord:  mockUpdateDailyRecord,
      upsertRecordByDate: mockUpsertRecordByDate,
    });

    // ── UserSettingsRepository stub (leave balance debiting) ──────────────────
    const userSettingsRepoKey = require.resolve(
      path.join(__dirname, "../repositories/UserSettingsRepository")
    );
    injectCacheStub(userSettingsRepoKey, {
      decrementLeaveBalance: mockDecrementLeaveBalance,
    });

    // ── SettingsService stub ──────────────────────────────────────────────────
    const settingsKey = require.resolve(
      path.join(__dirname, "./SettingsService")
    );
    injectCacheStub(settingsKey, {
      getSettingsOrThrow: mockGetSettingsOrThrow,
    });

    // ── LeaveBalanceService stub (lazy accrual catch-up) ───────────────────────
    const leaveBalanceSvcKey = require.resolve(
      path.join(__dirname, "./LeaveBalanceService")
    );
    injectCacheStub(leaveBalanceSvcKey, {
      applyPendingLeaveAccrual: mockApplyPendingLeaveAccrual,
    });

    // ── PrismaClient stub (markAbsence wraps the debitable-type write path
    //    in prisma.$transaction) — avoids loading the real client, which
    //    validates env vars and would try to actually connect.
    const prismaClientKey = require.resolve(
      path.join(__dirname, "../config/PrismaClient")
    );
    injectCacheStub(prismaClientKey, {
      prisma: { $transaction: mockTransaction },
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
    mockApplyPendingLeaveAccrual?.mock.resetCalls();
    mockDecrementLeaveBalance?.mock.resetCalls();
    mockTransaction?.mock.resetCalls();
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

  // ── setEndHour – time validation ──────────────────────────────────────────────

  describe("setEndHour – time validation", () => {
    it("throws INVALID_TIME_FORMAT for out-of-range hour (25:00)", async () => {
      await assert.rejects(
        () => setEndHour("user1", "12-06", "25:00"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "INVALID_TIME_FORMAT");
          return true;
        }
      );
    });

    it("throws INVALID_TIME_FORMAT for out-of-range minute (17:70)", async () => {
      await assert.rejects(
        () => setEndHour("user1", "12-06", "17:70"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "INVALID_TIME_FORMAT");
          return true;
        }
      );
    });

    it("throws INVALID_TIME_RANGE when end time is before existing start time (08:30 Jerusalem < 09:00 start)", async () => {
      // START_UTC is 06:00 UTC = 09:00 Jerusalem; 08:30 Jerusalem = 05:30 UTC → before start
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(false));
      await assert.rejects(
        () => setEndHour("user1", "12-06", "08:30"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "INVALID_TIME_RANGE");
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

  // ── setStartAndEndHours – time validation ─────────────────────────────────────

  describe("setStartAndEndHours – time validation", () => {
    it("throws INVALID_TIME_FORMAT for out-of-range startTime hour (25:00-45:00)", async () => {
      await assert.rejects(
        () => setStartAndEndHours("user1", "12-06", "25:00", "45:00"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "INVALID_TIME_FORMAT");
          return true;
        }
      );
    });

    it("throws INVALID_TIME_FORMAT for out-of-range endTime minute (08:00 start, 17:70 end)", async () => {
      await assert.rejects(
        () => setStartAndEndHours("user1", "12-06", "08:00", "17:70"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "INVALID_TIME_FORMAT");
          return true;
        }
      );
    });

    it("throws INVALID_TIME_RANGE when endTime is before startTime (17:30-09:00)", async () => {
      await assert.rejects(
        () => setStartAndEndHours("user1", "12-06", "17:30", "09:00"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "INVALID_TIME_RANGE");
          return true;
        }
      );
    });

    it("accepts a valid range (08:15-17:30) and returns a WORK record", async () => {
      const result = await setStartAndEndHours("user1", "12-06", "08:15", "17:30");
      assert.equal(result.recordType, "WORK");
      assert.ok(result.workedMinutes > 0);
    });
  });

  // ── markAbsence ───────────────────────────────────────────────────────────────

  describe("markAbsence – credited minutes (dailyRequiredMinutes = 480)", () => {
    it("credits SICK as full day (480 min) with zero balance at the day level", async () => {
      const result = await markAbsence("user1", "12-06", "SICK", 1);
      assert.equal(result.workedMinutes, DAILY_MIN);
      assert.equal(result.balanceMinutes, 0); // 480 - 480 = 0
    });

    it("credits VACATION as full day", async () => {
      const result = await markAbsence("user1", "12-06", "VACATION", 1);
      assert.equal(result.workedMinutes, DAILY_MIN);
    });

    it("credits HOLIDAY as full day", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY", 1);
      assert.equal(result.workedMinutes, DAILY_MIN);
    });

    it("credits ELECTION as full day", async () => {
      const result = await markAbsence("user1", "12-06", "ELECTION");
      assert.equal(result.workedMinutes, DAILY_MIN);
    });

    it("credits HOLIDAY_EVE as half day = floor(480 / 2) = 240 min", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY_EVE", 0.5);
      assert.equal(result.workedMinutes, Math.floor(DAILY_MIN / 2)); // 240
      assert.equal(result.balanceMinutes, Math.floor(DAILY_MIN / 2) - DAILY_MIN); // -240
    });

    it("credits UNPAID_ABSENCE as 0 min", async () => {
      const result = await markAbsence("user1", "12-06", "UNPAID_ABSENCE");
      assert.equal(result.workedMinutes, 0);
      assert.equal(result.balanceMinutes, -DAILY_MIN); // 0 - 480 = -480
    });

    it("sets recordType to the absence type (not WORK)", async () => {
      const result = await markAbsence("user1", "12-06", "SICK", 1);
      assert.equal(result.recordType, "SICK");
    });

    it("stores UNPAID_ABSENCE recordType correctly", async () => {
      const result = await markAbsence("user1", "12-06", "UNPAID_ABSENCE");
      assert.equal(result.recordType, "UNPAID_ABSENCE");
    });
  });

  describe("markAbsence – record shape", () => {
    it("calls upsertRecordByDate with null timestamps (no clock-in/out)", async () => {
      await markAbsence("user1", "12-06", "SICK", 1);
      const arg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.equal(arg.startTime, null);
      assert.equal(arg.expectedEndTime, null);
      assert.equal(arg.endTime, null);
    });

    it("calls upsertRecordByDate exactly once", async () => {
      await markAbsence("user1", "12-06", "VACATION", 1);
      assert.equal(mockUpsertRecordByDate.mock.calls.length, 1);
    });

    it("is allowed on an existing CLOSED_WORK_RECORD (replaces it with absence)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(true));
      const result = await markAbsence("user1", "12-06", "SICK", 1);
      assert.equal(result.recordType, "SICK");
    });

    it("is allowed on an existing ABSENCE_RECORD (changes absence type)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN)
      );
      const result = await markAbsence("user1", "12-06", "SICK", 1);
      assert.equal(result.recordType, "SICK");
    });
  });

  // ── markAbsence – leave balance debiting ────────────────────────────────────

  describe("markAbsence – leave balance debiting", () => {
    it("debits vacationBalance for VACATION and returns leaveDebit", async () => {
      const result = await markAbsence("user1", "12-06", "VACATION", 1.5);

      assert.equal(mockDecrementLeaveBalance.mock.calls.length, 1);
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[0], "user1");
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[1], "vacationBalance");
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[2], 1.5);

      assert.deepEqual(result.leaveDebit, {
        field: "vacationBalance",
        amount: 1.5,
        newBalance: SETTINGS.vacationBalance - 1.5,
      });
    });

    it("debits vacationBalance for HOLIDAY", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY", 1);
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[1], "vacationBalance");
      assert.equal(result.leaveDebit?.field, "vacationBalance");
    });

    it("debits vacationBalance for HOLIDAY_EVE", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY_EVE", 0.5);
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[1], "vacationBalance");
      assert.equal(result.leaveDebit?.amount, 0.5);
    });

    it("debits sickBalance for SICK", async () => {
      const result = await markAbsence("user1", "12-06", "SICK", 2);

      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[1], "sickBalance");
      assert.deepEqual(result.leaveDebit, {
        field: "sickBalance",
        amount: 2,
        newBalance: SETTINGS.sickBalance - 2,
      });
    });

    it("never debits a balance for UNPAID_ABSENCE", async () => {
      const result = await markAbsence("user1", "12-06", "UNPAID_ABSENCE");

      assert.equal(mockDecrementLeaveBalance.mock.calls.length, 0);
      assert.equal(result.leaveDebit, null);
    });

    it("never debits a balance for ELECTION", async () => {
      const result = await markAbsence("user1", "12-06", "ELECTION");

      assert.equal(mockDecrementLeaveBalance.mock.calls.length, 0);
      assert.equal(result.leaveDebit, null);
    });

    it("catches up pending leave accrual before debiting (via applyPendingLeaveAccrual, not getSettingsOrThrow)", async () => {
      await markAbsence("user1", "12-06", "VACATION", 1);

      assert.equal(mockApplyPendingLeaveAccrual.mock.calls.length, 1);
      assert.equal(mockApplyPendingLeaveAccrual.mock.calls[0].arguments[0], "user1");
      assert.equal(mockGetSettingsOrThrow.mock.calls.length, 0);
    });

    describe("transactional write for debitable types", () => {
      it("wraps the record upsert and balance decrement in a single prisma.$transaction", async () => {
        await markAbsence("user1", "12-06", "VACATION", 1);

        assert.equal(mockTransaction.mock.calls.length, 1);
      });

      it("passes the same transaction handle to both the record upsert and the balance decrement", async () => {
        await markAbsence("user1", "12-06", "SICK", 1);

        // upsertRecordByDate(input, tx) -> tx is the 2nd argument
        assert.equal(mockUpsertRecordByDate.mock.calls[0].arguments[1], FAKE_TX);
        // decrementLeaveBalance(telegramId, field, amount, tx) -> tx is the 4th argument
        assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[3], FAKE_TX);
      });

      it("does not open a transaction for non-debitable types", async () => {
        await markAbsence("user1", "12-06", "UNPAID_ABSENCE");

        assert.equal(mockTransaction.mock.calls.length, 0);
        // Falls back to the standalone (non-transactional) upsert call, no tx argument.
        assert.equal(mockUpsertRecordByDate.mock.calls[0].arguments[1], undefined);
      });
    });

    describe("debitDays validation for debitable types", () => {
      it("throws VALIDATION_ERROR when debitDays is omitted for VACATION", async () => {
        await assert.rejects(
          () => markAbsence("user1", "12-06", "VACATION"),
          (err: unknown) => {
            assert.equal((err as { code: string }).code, "VALIDATION_ERROR");
            return true;
          }
        );
      });

      it("throws VALIDATION_ERROR when debitDays is 0 for SICK", async () => {
        await assert.rejects(
          () => markAbsence("user1", "12-06", "SICK", 0),
          (err: unknown) => {
            assert.equal((err as { code: string }).code, "VALIDATION_ERROR");
            return true;
          }
        );
      });

      it("throws VALIDATION_ERROR when debitDays is negative for HOLIDAY", async () => {
        await assert.rejects(
          () => markAbsence("user1", "12-06", "HOLIDAY", -1),
          (err: unknown) => {
            assert.equal((err as { code: string }).code, "VALIDATION_ERROR");
            return true;
          }
        );
      });

      it("validates before writing — upsertRecordByDate is never called when debitDays is invalid", async () => {
        await assert.rejects(() => markAbsence("user1", "12-06", "VACATION"));
        assert.equal(mockUpsertRecordByDate.mock.calls.length, 0);
        assert.equal(mockDecrementLeaveBalance.mock.calls.length, 0);
      });

      it("does not require debitDays for UNPAID_ABSENCE", async () => {
        await assert.doesNotReject(() => markAbsence("user1", "12-06", "UNPAID_ABSENCE"));
      });

      it("does not require debitDays for ELECTION", async () => {
        await assert.doesNotReject(() => markAbsence("user1", "12-06", "ELECTION"));
      });
    });
  });
});
