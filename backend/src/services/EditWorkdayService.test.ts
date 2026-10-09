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
  cholHamoedRequiredMinutes: null as number | null,
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
    absencePortion: null,
    startTime: START_UTC,
    expectedEndTime: new Date(START_UTC.getTime() + DAILY_MIN * 60_000),
    endTime: closed ? new Date("2026-06-12T14:00:00Z") : null,
    workedMinutes: closed ? DAILY_MIN : null,
    creditedMinutes: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makePeriod(
  startTime: Date,
  endTime: Date | null,
  id = "p1",
  dailyRecordId = "r1"
) {
  return { id, dailyRecordId, startTime, endTime, createdAt: new Date(), updatedAt: new Date() };
}

/** UTC instant for an HH:mm on the edited date (Jerusalem is UTC+3 in June). */
function jlm(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 5, 12, h - 3, m));
}

function makeAbsenceRecord(
  recordType: string,
  creditedMinutes: number,
  debitedLeaveField: "vacationBalance" | "sickBalance" | null = null,
  debitedLeaveDays: number | null = null,
  absencePortion: "FULL" | "HALF" = "FULL"
) {
  return {
    id: "r2",
    telegramId: "user1",
    workDate: new Date("2026-06-12T00:00:00Z"),
    recordType,
    absencePortion,
    startTime: null,
    expectedEndTime: null,
    endTime: null,
    workedMinutes: 0,
    creditedMinutes,
    debitedLeaveField,
    debitedLeaveDays,
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
  let setHoursOnHalfDay: any;

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
  let mockCreditLeaveBalance: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockTransaction: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockListWorkPeriods: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCreateWorkPeriod: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockUpdateWorkPeriod: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDeleteWorkPeriod: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDeleteWorkPeriodsOfRecord: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDeleteDailyRecord: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let addWorkPeriod: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let editWorkPeriod: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let removeWorkPeriod: any;

  // Distinguishable marker so tests can assert both repo calls inside a
  // transaction received the same `tx` handle passed to prisma.$transaction().
  const FAKE_TX = { __fakeTx: true };

  // Stateful, compounding balances so a refund followed by a same-field debit
  // (or vice versa) within one test correctly reflects both operations, the
  // way sequential real DB updates would — not each independently computed
  // from the static SETTINGS fixture. Reset between tests in afterEach.
  let currentBalances: { vacationBalance: number; sickBalance: number };
  function resetCurrentBalances(): void {
    currentBalances = {
      vacationBalance: SETTINGS.vacationBalance,
      sickBalance: SETTINGS.sickBalance,
    };
  }
  resetCurrentBalances();

  // The date resolveDdMmToDate returns. Tests may point it elsewhere (e.g. a
  // Chol HaMoed day); reset to FIXED_DATE in afterEach.
  let editedDate = FIXED_DATE;

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
        absencePortion: input["absencePortion"] ?? null,
        startTime: input["startTime"],
        expectedEndTime: input["expectedEndTime"],
        endTime: input["endTime"],
        workedMinutes: input["workedMinutes"],
        creditedMinutes: input["creditedMinutes"] ?? 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
    mockGetSettingsOrThrow = mock.fn(async () => SETTINGS);
    mockApplyPendingLeaveAccrual = mock.fn(async () => SETTINGS);
    mockDecrementLeaveBalance = mock.fn(
      async (_telegramId: string, field: "vacationBalance" | "sickBalance", amount: number) => {
        currentBalances[field] -= amount;
        return { ...SETTINGS, ...currentBalances };
      }
    );
    mockCreditLeaveBalance = mock.fn(
      async (_telegramId: string, field: "vacationBalance" | "sickBalance", amount: number) => {
        currentBalances[field] += amount;
        return { ...SETTINGS, ...currentBalances };
      }
    );
    mockTransaction = mock.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(FAKE_TX)
    );

    // Default: the date's single period is open from 09:00 Jerusalem
    // (matches makeWorkRecord(false)); tests about closed periods override it.
    mockListWorkPeriods = mock.fn(async (dailyRecordId: string) => [
      makePeriod(START_UTC, null, "p1", dailyRecordId),
    ]);
    mockCreateWorkPeriod = mock.fn(
      async (input: { dailyRecordId: string; startTime: Date; endTime?: Date | null }) =>
        makePeriod(input.startTime, input.endTime ?? null, "p-new", input.dailyRecordId)
    );
    mockUpdateWorkPeriod = mock.fn(async (id: string, input: Record<string, unknown>) => ({
      ...makePeriod(START_UTC, null, id),
      ...input,
    }));
    mockDeleteWorkPeriod = mock.fn(async () => undefined);
    mockDeleteWorkPeriodsOfRecord = mock.fn(async () => undefined);
    mockDeleteDailyRecord = mock.fn(async () => undefined);

    // ── Repository stubs ──────────────────────────────────────────────────────
    const repoKey = require.resolve(
      path.join(__dirname, "../repositories/DailyRecordRepository")
    );
    injectCacheStub(repoKey, {
      findRecordByDate:   mockFindRecordByDate,
      updateDailyRecord:  mockUpdateDailyRecord,
      upsertRecordByDate: mockUpsertRecordByDate,
      deleteDailyRecord:  mockDeleteDailyRecord,
    });

    const periodRepoKey = require.resolve(
      path.join(__dirname, "../repositories/WorkPeriodRepository")
    );
    injectCacheStub(periodRepoKey, {
      listWorkPeriods:           mockListWorkPeriods,
      createWorkPeriod:          mockCreateWorkPeriod,
      updateWorkPeriod:          mockUpdateWorkPeriod,
      deleteWorkPeriod:          mockDeleteWorkPeriod,
      deleteWorkPeriodsOfRecord: mockDeleteWorkPeriodsOfRecord,
    });

    // ── UserSettingsRepository stub (leave balance debiting) ──────────────────
    const userSettingsRepoKey = require.resolve(
      path.join(__dirname, "../repositories/UserSettingsRepository")
    );
    injectCacheStub(userSettingsRepoKey, {
      decrementLeaveBalance: mockDecrementLeaveBalance,
      creditLeaveBalance: mockCreditLeaveBalance,
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
      localDateToUtcMidnight: realDateUtils.localDateToUtcMidnight,
      resolveDdMmToDate:  () => editedDate, // deterministic, avoids year dependency
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
    setHoursOnHalfDay   = svc.setHoursOnHalfDay;
    addWorkPeriod       = svc.addWorkPeriod;
    editWorkPeriod      = svc.editWorkPeriod;
    removeWorkPeriod    = svc.removeWorkPeriod;
  });

  afterEach(() => {
    mockFindRecordByDate?.mock.resetCalls();
    mockUpdateDailyRecord?.mock.resetCalls();
    mockUpsertRecordByDate?.mock.resetCalls();
    mockGetSettingsOrThrow?.mock.resetCalls();
    mockApplyPendingLeaveAccrual?.mock.resetCalls();
    mockDecrementLeaveBalance?.mock.resetCalls();
    mockCreditLeaveBalance?.mock.resetCalls();
    mockTransaction?.mock.resetCalls();
    mockListWorkPeriods?.mock.resetCalls();
    mockCreateWorkPeriod?.mock.resetCalls();
    mockUpdateWorkPeriod?.mock.resetCalls();
    mockDeleteWorkPeriod?.mock.resetCalls();
    mockDeleteWorkPeriodsOfRecord?.mock.resetCalls();
    mockDeleteDailyRecord?.mock.resetCalls();
    resetCurrentBalances();
    editedDate = FIXED_DATE;
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
    const HALF_MIN = Math.floor(DAILY_MIN / 2); // 240

    it("credits SICK FULL as a full day with zero balance at the day level", async () => {
      const result = await markAbsence("user1", "12-06", "SICK", "FULL");
      assert.equal(result.creditedMinutes, DAILY_MIN);
      assert.equal(result.workedMinutes, 0);
      assert.equal(result.balanceMinutes, 0); // 0 + 480 - 480 = 0
    });

    it("credits VACATION FULL as a full day", async () => {
      const result = await markAbsence("user1", "12-06", "VACATION", "FULL");
      assert.equal(result.creditedMinutes, DAILY_MIN);
    });

    it("credits VACATION HALF as half a day", async () => {
      const result = await markAbsence("user1", "12-06", "VACATION", "HALF");
      assert.equal(result.creditedMinutes, HALF_MIN);
      assert.equal(result.balanceMinutes, HALF_MIN - DAILY_MIN); // -240
    });

    it("credits SICK HALF as half a day", async () => {
      const result = await markAbsence("user1", "12-06", "SICK", "HALF");
      assert.equal(result.creditedMinutes, HALF_MIN);
    });

    it("credits HOLIDAY as full day", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY");
      assert.equal(result.creditedMinutes, DAILY_MIN);
    });

    it("credits ELECTION as full day", async () => {
      const result = await markAbsence("user1", "12-06", "ELECTION");
      assert.equal(result.creditedMinutes, DAILY_MIN);
    });

    it("credits HOLIDAY_EVE as half day by default (company-paid half only)", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY_EVE");
      assert.equal(result.creditedMinutes, HALF_MIN);
      assert.equal(result.balanceMinutes, HALF_MIN - DAILY_MIN); // -240
    });

    it("credits HOLIDAY_EVE FULL (other half as vacation) as a full day", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY_EVE", "FULL");
      assert.equal(result.creditedMinutes, DAILY_MIN);
      assert.equal(result.balanceMinutes, 0);
    });

    it("credits UNPAID_ABSENCE as 0 min", async () => {
      const result = await markAbsence("user1", "12-06", "UNPAID_ABSENCE");
      assert.equal(result.creditedMinutes, 0);
      assert.equal(result.balanceMinutes, -DAILY_MIN); // 0 - 480 = -480
    });

    it("writes the portion and credit to the record, with workedMinutes 0", async () => {
      await markAbsence("user1", "12-06", "VACATION", "HALF");
      const upsertArg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.equal(upsertArg.absencePortion, "HALF");
      assert.equal(upsertArg.creditedMinutes, HALF_MIN);
      assert.equal(upsertArg.workedMinutes, 0);
    });

    it("stores FULL for types with a fixed portion even when HALF is passed", async () => {
      await markAbsence("user1", "12-06", "HOLIDAY", "HALF");
      assert.equal(mockUpsertRecordByDate.mock.calls[0].arguments[0].absencePortion, "FULL");
    });

    it("sets recordType to the absence type (not WORK)", async () => {
      const result = await markAbsence("user1", "12-06", "SICK", "FULL");
      assert.equal(result.recordType, "SICK");
    });

    it("stores UNPAID_ABSENCE recordType correctly", async () => {
      const result = await markAbsence("user1", "12-06", "UNPAID_ABSENCE");
      assert.equal(result.recordType, "UNPAID_ABSENCE");
    });
  });

  describe("markAbsence – record shape", () => {
    it("calls upsertRecordByDate with null timestamps (no clock-in/out)", async () => {
      await markAbsence("user1", "12-06", "SICK", "FULL");
      const arg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.equal(arg.startTime, null);
      assert.equal(arg.expectedEndTime, null);
      assert.equal(arg.endTime, null);
    });

    it("calls upsertRecordByDate exactly once", async () => {
      await markAbsence("user1", "12-06", "VACATION", "FULL");
      assert.equal(mockUpsertRecordByDate.mock.calls.length, 1);
    });

    it("is allowed on an existing CLOSED_WORK_RECORD (replaces it with absence)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(true));
      const result = await markAbsence("user1", "12-06", "SICK", "FULL");
      assert.equal(result.recordType, "SICK");
    });

    it("is allowed on an existing ABSENCE_RECORD (changes absence type)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN)
      );
      const result = await markAbsence("user1", "12-06", "SICK", "FULL");
      assert.equal(result.recordType, "SICK");
    });
  });

  // ── markAbsence – leave balance debiting ────────────────────────────────────

  describe("markAbsence – leave balance debiting", () => {
    it("debits 1 vacation day for VACATION FULL and returns leaveDebit", async () => {
      const result = await markAbsence("user1", "12-06", "VACATION", "FULL");

      assert.equal(mockDecrementLeaveBalance.mock.calls.length, 1);
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[0], "user1");
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[1], "vacationBalance");
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[2], 1);

      assert.deepEqual(result.leaveDebit, {
        field: "vacationBalance",
        amount: 1,
        newBalance: SETTINGS.vacationBalance - 1,
      });
    });

    it("debits 0.5 vacation day for VACATION HALF", async () => {
      const result = await markAbsence("user1", "12-06", "VACATION", "HALF");

      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[2], 0.5);
      assert.equal(result.leaveDebit?.amount, 0.5);
    });

    it("debits 0.5 vacation day for HOLIDAY_EVE FULL (other half taken as vacation)", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY_EVE", "FULL");

      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[1], "vacationBalance");
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[2], 0.5);
      assert.equal(result.leaveDebit?.amount, 0.5);
    });

    it("never debits a balance for HOLIDAY (company-paid)", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY");

      assert.equal(mockDecrementLeaveBalance.mock.calls.length, 0);
      assert.equal(result.leaveDebit, null);
    });

    it("never debits a balance for HOLIDAY_EVE (company-paid)", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY_EVE");

      assert.equal(mockDecrementLeaveBalance.mock.calls.length, 0);
      assert.equal(result.leaveDebit, null);
    });

    it("never debits a balance for HOLIDAY even when a portion is passed", async () => {
      const result = await markAbsence("user1", "12-06", "HOLIDAY", "HALF");

      assert.equal(mockDecrementLeaveBalance.mock.calls.length, 0);
      assert.equal(result.leaveDebit, null);
      assert.equal(mockUpsertRecordByDate.mock.calls[0].arguments[0].debitedLeaveDays, null);
    });

    it("debits sickBalance for SICK", async () => {
      const result = await markAbsence("user1", "12-06", "SICK", "FULL");

      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[1], "sickBalance");
      assert.deepEqual(result.leaveDebit, {
        field: "sickBalance",
        amount: 1,
        newBalance: SETTINGS.sickBalance - 1,
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
      await markAbsence("user1", "12-06", "VACATION", "FULL");

      assert.equal(mockApplyPendingLeaveAccrual.mock.calls.length, 1);
      assert.equal(mockApplyPendingLeaveAccrual.mock.calls[0].arguments[0], "user1");
      assert.equal(mockGetSettingsOrThrow.mock.calls.length, 0);
    });

    describe("transactional write for debitable types", () => {
      it("wraps the record upsert and balance decrement in a single prisma.$transaction", async () => {
        await markAbsence("user1", "12-06", "VACATION", "FULL");

        assert.equal(mockTransaction.mock.calls.length, 1);
      });

      it("passes the same transaction handle to both the record upsert and the balance decrement", async () => {
        await markAbsence("user1", "12-06", "SICK", "FULL");

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

    describe("portion validation", () => {
      it("throws VALIDATION_ERROR when portion is omitted for VACATION", async () => {
        await assert.rejects(
          () => markAbsence("user1", "12-06", "VACATION"),
          (err: unknown) => {
            assert.equal((err as { code: string }).code, "VALIDATION_ERROR");
            return true;
          }
        );
      });

      it("throws VALIDATION_ERROR when portion is omitted for SICK", async () => {
        await assert.rejects(
          () => markAbsence("user1", "12-06", "SICK"),
          (err: unknown) => {
            assert.equal((err as { code: string }).code, "VALIDATION_ERROR");
            return true;
          }
        );
      });

      it("validates before writing — upsertRecordByDate is never called when portion is missing", async () => {
        await assert.rejects(() => markAbsence("user1", "12-06", "VACATION"));
        assert.equal(mockUpsertRecordByDate.mock.calls.length, 0);
        assert.equal(mockDecrementLeaveBalance.mock.calls.length, 0);
      });

      it("does not require a portion for UNPAID_ABSENCE", async () => {
        await assert.doesNotReject(() => markAbsence("user1", "12-06", "UNPAID_ABSENCE"));
      });

      it("does not require a portion for ELECTION", async () => {
        await assert.doesNotReject(() => markAbsence("user1", "12-06", "ELECTION"));
      });

      it("does not require a portion for HOLIDAY", async () => {
        await assert.doesNotReject(() => markAbsence("user1", "12-06", "HOLIDAY"));
      });

      it("does not require a portion for HOLIDAY_EVE", async () => {
        await assert.doesNotReject(() => markAbsence("user1", "12-06", "HOLIDAY_EVE"));
      });
    });
  });

  // ── markAbsence – refunds a previous debit on type/amount change ────────────

  describe("markAbsence – refunds previous debit on type/amount change", () => {
    it("refunds the previous debit and applies the new one when the type changes to a different balance (VACATION -> SICK)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN, "vacationBalance", 1)
      );

      const result = await markAbsence("user1", "12-06", "SICK", "FULL");

      assert.equal(mockCreditLeaveBalance.mock.calls.length, 1);
      assert.equal(mockCreditLeaveBalance.mock.calls[0].arguments[0], "user1");
      assert.equal(mockCreditLeaveBalance.mock.calls[0].arguments[1], "vacationBalance");
      assert.equal(mockCreditLeaveBalance.mock.calls[0].arguments[2], 1);

      assert.equal(mockDecrementLeaveBalance.mock.calls.length, 1);
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[1], "sickBalance");
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[2], 1);

      assert.deepEqual(result.leaveRefund, {
        field: "vacationBalance",
        amount: 1,
        newBalance: SETTINGS.vacationBalance + 1,
      });
      assert.deepEqual(result.leaveDebit, {
        field: "sickBalance",
        amount: 1,
        newBalance: SETTINGS.sickBalance - 1,
      });
    });

    it("nets out correctly when the refund and the new debit target the same field (VACATION 1 -> VACATION 0.5)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN, "vacationBalance", 1)
      );

      const result = await markAbsence("user1", "12-06", "VACATION", "HALF");

      assert.equal(mockCreditLeaveBalance.mock.calls[0].arguments[2], 1);
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[2], 0.5);

      // Net: 10 (base) + 1 (refund) - 0.5 (new debit) = 10.5 — both fields of
      // the response reflect the final, post-both-operations balance.
      const expectedFinal = SETTINGS.vacationBalance + 1 - 0.5;
      assert.equal(result.leaveRefund?.newBalance, expectedFinal);
      assert.equal(result.leaveDebit?.newBalance, expectedFinal);
    });

    it("refunds with no new debit when changing to a non-debitable type (VACATION -> UNPAID_ABSENCE)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN, "vacationBalance", 1)
      );

      const result = await markAbsence("user1", "12-06", "UNPAID_ABSENCE");

      assert.equal(mockCreditLeaveBalance.mock.calls.length, 1);
      assert.equal(mockDecrementLeaveBalance.mock.calls.length, 0);

      assert.deepEqual(result.leaveRefund, {
        field: "vacationBalance",
        amount: 1,
        newBalance: SETTINGS.vacationBalance + 1,
      });
      assert.equal(result.leaveDebit, null);

      const upsertArg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.equal(upsertArg.debitedLeaveField, null);
      assert.equal(upsertArg.debitedLeaveDays, null);
    });

    it("refunds with no new debit when re-marking a vacation day as a holiday (VACATION -> HOLIDAY)", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN, "vacationBalance", 1)
      );

      const result = await markAbsence("user1", "12-06", "HOLIDAY");

      assert.equal(mockCreditLeaveBalance.mock.calls.length, 1);
      assert.equal(mockDecrementLeaveBalance.mock.calls.length, 0);
      assert.deepEqual(result.leaveRefund, {
        field: "vacationBalance",
        amount: 1,
        newBalance: SETTINGS.vacationBalance + 1,
      });
      assert.equal(result.leaveDebit, null);
    });

    it("stamps the new record with the new debit's field and amount", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN, "vacationBalance", 1)
      );

      await markAbsence("user1", "12-06", "SICK", "HALF");

      const upsertArg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.equal(upsertArg.debitedLeaveField, "sickBalance");
      assert.equal(upsertArg.debitedLeaveDays, 0.5);
    });

    it("does not attempt a refund for a fresh NO_RECORD -> VACATION marking", async () => {
      // default mockFindRecordByDate returns null (NO_RECORD)
      const result = await markAbsence("user1", "12-06", "VACATION", "FULL");

      assert.equal(mockCreditLeaveBalance.mock.calls.length, 0);
      assert.equal(result.leaveRefund, null);
    });

    it("does not attempt a refund for a pre-existing record with no tracked debit (legacy record)", async () => {
      // debitedLeaveField/Days default to null — simulates a record created
      // before this feature shipped, when the columns didn't exist yet.
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN)
      );

      const result = await markAbsence("user1", "12-06", "SICK", "FULL");

      assert.equal(mockCreditLeaveBalance.mock.calls.length, 0);
      assert.equal(result.leaveRefund, null);
      // The new debit still applies normally.
      assert.equal(mockDecrementLeaveBalance.mock.calls.length, 1);
    });

    it("opens a transaction for a refund even when the new type is non-debitable", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN, "vacationBalance", 1)
      );

      await markAbsence("user1", "12-06", "UNPAID_ABSENCE");

      assert.equal(mockTransaction.mock.calls.length, 1);
    });

    it("passes the same transaction handle to the upsert, the refund, and the new debit", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN, "vacationBalance", 1)
      );

      await markAbsence("user1", "12-06", "SICK", "FULL");

      assert.equal(mockUpsertRecordByDate.mock.calls[0].arguments[1], FAKE_TX);
      assert.equal(mockCreditLeaveBalance.mock.calls[0].arguments[3], FAKE_TX);
      assert.equal(mockDecrementLeaveBalance.mock.calls[0].arguments[3], FAKE_TX);
    });
  });

  // ── setStartAndEndHours – refunds a previous debit ───────────────────────────

  describe("setStartAndEndHours – refunds previous debit", () => {
    it("refunds the previous debit when converting a previously-debited absence day to worked hours", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN, "vacationBalance", 1)
      );

      const result = await setStartAndEndHours("user1", "12-06", "08:00", "16:00");

      assert.equal(mockCreditLeaveBalance.mock.calls.length, 1);
      assert.equal(mockCreditLeaveBalance.mock.calls[0].arguments[0], "user1");
      assert.equal(mockCreditLeaveBalance.mock.calls[0].arguments[1], "vacationBalance");
      assert.equal(mockCreditLeaveBalance.mock.calls[0].arguments[2], 1);

      assert.deepEqual(result.leaveRefund, {
        field: "vacationBalance",
        amount: 1,
        newBalance: SETTINGS.vacationBalance + 1,
      });

      const upsertArg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.equal(upsertArg.debitedLeaveField, null);
      assert.equal(upsertArg.debitedLeaveDays, null);
      // The overwritten absence's credit and portion are cleared too.
      assert.equal(upsertArg.creditedMinutes, 0);
      assert.equal(upsertArg.absencePortion, null);
      assert.equal(result.creditedMinutes, 0);
      assert.equal(result.balanceMinutes, result.workedMinutes - DAILY_MIN);
    });

    it("does not attempt a refund when the existing record is a plain WORK record", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(true));

      const result = await setStartAndEndHours("user1", "12-06", "08:00", "16:00");

      assert.equal(mockCreditLeaveBalance.mock.calls.length, 0);
      assert.equal(result.leaveRefund, null);
    });

    it("does not attempt a refund for NO_RECORD", async () => {
      const result = await setStartAndEndHours("user1", "12-06", "08:00", "16:00");

      assert.equal(mockCreditLeaveBalance.mock.calls.length, 0);
      assert.equal(result.leaveRefund, null);
    });

    it("catches up pending leave accrual first (via applyPendingLeaveAccrual, not getSettingsOrThrow)", async () => {
      await setStartAndEndHours("user1", "12-06", "08:00", "16:00");

      assert.equal(mockApplyPendingLeaveAccrual.mock.calls.length, 1);
      assert.equal(mockGetSettingsOrThrow.mock.calls.length, 0);
    });

    it("opens a transaction and shares the tx handle when there's a previous debit", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("SICK", DAILY_MIN, "sickBalance", 1.5)
      );

      await setStartAndEndHours("user1", "12-06", "08:00", "16:00");

      assert.equal(mockTransaction.mock.calls.length, 1);
      assert.equal(mockUpsertRecordByDate.mock.calls[0].arguments[1], FAKE_TX);
      assert.equal(mockCreditLeaveBalance.mock.calls[0].arguments[3], FAKE_TX);
    });

    it("refunds nothing when there's nothing to refund, but still writes record and period together", async () => {
      await setStartAndEndHours("user1", "12-06", "08:00", "16:00");

      assert.equal(mockCreditLeaveBalance.mock.calls.length, 0);
      assert.equal(mockTransaction.mock.calls.length, 1);
      assert.equal(mockUpsertRecordByDate.mock.calls[0].arguments[1], FAKE_TX);
    });
  });

  // ── Half-day absences ────────────────────────────────────────────────────────
  //
  // 12-06 in Asia/Jerusalem is UTC+3: 13:00–17:00 local = 10:00–14:00 UTC.

  const HALF_MIN = Math.floor(DAILY_MIN / 2); // 240

  /** ½ vacation day (0.5 debited), optionally with logged or in-progress hours. */
  function makeHalfVacation(hours: "none" | "open" | "closed" = "none") {
    const base = makeAbsenceRecord("VACATION", HALF_MIN, "vacationBalance", 0.5, "HALF");
    if (hours === "none") return base;
    const startTime = new Date("2026-06-12T10:00:00Z");
    return {
      ...base,
      startTime,
      expectedEndTime: new Date(startTime.getTime() + HALF_MIN * 60_000),
      endTime: hours === "closed" ? new Date("2026-06-12T14:00:00Z") : null,
      workedMinutes: hours === "closed" ? 240 : null,
    };
  }

  describe("getEditDayOptions – half-day absences", () => {
    it("returns HALF_DAY_RECORD for a half day with no hours, allowing LOG_HOURS but not SET_END_HOUR", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeHalfVacation("none"));
      const opts = await getEditDayOptions("user1", "12-06");
      assert.equal(opts.state, "HALF_DAY_RECORD");
      assert.ok(opts.allowedActions.includes("LOG_HOURS"));
      assert.ok(!opts.allowedActions.includes("SET_END_HOUR"));
    });

    it("returns HALF_DAY_RECORD for a half day whose hours are already logged", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeHalfVacation("closed"));
      const opts = await getEditDayOptions("user1", "12-06");
      assert.equal(opts.state, "HALF_DAY_RECORD");
    });

    it("returns HALF_DAY_OPEN_RECORD for a half day with a session in progress, allowing SET_END_HOUR", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeHalfVacation("open"));
      const opts = await getEditDayOptions("user1", "12-06");
      assert.equal(opts.state, "HALF_DAY_OPEN_RECORD");
      assert.ok(opts.allowedActions.includes("SET_END_HOUR"));
      assert.ok(opts.allowedActions.includes("LOG_HOURS"));
    });

    it("keeps full-day absences as ABSENCE_RECORD, where LOG_HOURS is not allowed", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () =>
        makeAbsenceRecord("VACATION", DAILY_MIN, "vacationBalance", 1, "FULL")
      );
      const opts = await getEditDayOptions("user1", "12-06");
      assert.equal(opts.state, "ABSENCE_RECORD");
      assert.ok(!opts.allowedActions.includes("LOG_HOURS"));
    });
  });

  describe("setHoursOnHalfDay", () => {
    function echoUpdateOn(record: Record<string, unknown>) {
      mockUpdateDailyRecord.mock.mockImplementationOnce(
        async (_id: string, updates: Record<string, unknown>) => ({ ...record, ...updates })
      );
    }

    it("sets the hours and keeps the absence, credit and debit", async () => {
      const record = makeHalfVacation("none");
      mockFindRecordByDate.mock.mockImplementationOnce(async () => record);
      echoUpdateOn(record);

      const result = await setHoursOnHalfDay("user1", "12-06", "13:00", "17:00");

      assert.equal(mockUpdateDailyRecord.mock.calls.length, 1);
      const [id, updates] = mockUpdateDailyRecord.mock.calls[0].arguments;
      assert.equal(id, record.id);
      // Only session fields are written — absence, credit and debit untouched.
      assert.deepEqual(
        Object.keys(updates).sort(),
        ["endTime", "expectedEndTime", "startTime", "workedMinutes"]
      );
      assert.equal(updates.workedMinutes, 240);
      assert.equal(
        (updates.expectedEndTime as Date).getTime() - (updates.startTime as Date).getTime(),
        HALF_MIN * 60_000
      );

      assert.equal(result.recordType, "VACATION");
      assert.equal(result.absencePortion, "HALF");
      assert.equal(result.creditedMinutes, HALF_MIN);
      assert.equal(result.workedMinutes, 240);
      assert.equal(result.balanceMinutes, 0); // 240 worked + 240 credited - 480

      assert.equal(mockUpsertRecordByDate.mock.calls.length, 0);
      assert.equal(mockDecrementLeaveBalance.mock.calls.length, 0);
      assert.equal(mockCreditLeaveBalance.mock.calls.length, 0);
    });

    it("replaces hours that were already logged on the half day", async () => {
      const record = makeHalfVacation("closed");
      mockFindRecordByDate.mock.mockImplementationOnce(async () => record);
      echoUpdateOn(record);

      const result = await setHoursOnHalfDay("user1", "12-06", "13:00", "18:00");
      assert.equal(result.workedMinutes, 300);
    });

    it("is allowed while a session on the half day is still open", async () => {
      const record = makeHalfVacation("open");
      mockFindRecordByDate.mock.mockImplementationOnce(async () => record);
      echoUpdateOn(record);

      const result = await setHoursOnHalfDay("user1", "12-06", "13:00", "17:00");
      assert.equal(result.workedMinutes, 240);
    });

    for (const [label, makeRecord] of [
      ["NO_RECORD", () => null],
      ["CLOSED_WORK_RECORD", () => makeWorkRecord(true)],
      ["a full-day absence", () => makeAbsenceRecord("HOLIDAY", DAILY_MIN)],
    ] as const) {
      it(`throws CONFLICT on ${label}`, async () => {
        mockFindRecordByDate.mock.mockImplementationOnce(async () => makeRecord());
        await assert.rejects(
          () => setHoursOnHalfDay("user1", "12-06", "13:00", "17:00"),
          (err: unknown) => {
            assert.equal((err as { code: string }).code, "CONFLICT");
            return true;
          }
        );
        assert.equal(mockUpdateDailyRecord.mock.calls.length, 0);
      });
    }

    it("throws INVALID_TIME_RANGE when end is not after start", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeHalfVacation("none"));
      await assert.rejects(
        () => setHoursOnHalfDay("user1", "12-06", "17:00", "13:00"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "INVALID_TIME_RANGE");
          return true;
        }
      );
    });

    it("throws INVALID_TIME_FORMAT before touching the database", async () => {
      await assert.rejects(
        () => setHoursOnHalfDay("user1", "12-06", "1pm", "17:00"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "INVALID_TIME_FORMAT");
          return true;
        }
      );
      assert.equal(mockFindRecordByDate.mock.calls.length, 0);
    });
  });

  describe("setEndHour – half day with a session in progress", () => {
    it("closes the session and includes the half-day credit in the balance", async () => {
      const record = makeHalfVacation("open");
      mockFindRecordByDate.mock.mockImplementationOnce(async () => record);
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(record.startTime!, null, "p1", record.id),
      ]);
      mockUpdateDailyRecord.mock.mockImplementationOnce(
        async (_id: string, updates: Record<string, unknown>) => ({ ...record, ...updates })
      );

      const result = await setEndHour("user1", "12-06", "17:00"); // 13:00–17:00 local

      assert.equal(result.workedMinutes, 240);
      assert.equal(result.creditedMinutes, HALF_MIN);
      assert.equal(result.balanceMinutes, 0);
      assert.equal(result.recordType, "VACATION");
    });
  });

  describe("markAbsence – keeps logged hours on half days", () => {
    it("keeps the hours when a work day is re-marked as a half vacation day", async () => {
      // makeWorkRecord(true): 06:00–14:00 UTC, 480 worked
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(true));

      const result = await markAbsence("user1", "12-06", "VACATION", "HALF");

      const upsertArg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.deepEqual(upsertArg.startTime, START_UTC);
      assert.deepEqual(upsertArg.endTime, new Date("2026-06-12T14:00:00Z"));
      assert.equal(upsertArg.workedMinutes, DAILY_MIN);
      assert.equal(upsertArg.creditedMinutes, HALF_MIN);
      assert.equal(
        (upsertArg.expectedEndTime as Date).getTime() - START_UTC.getTime(),
        HALF_MIN * 60_000
      );
      assert.equal(result.balanceMinutes, DAILY_MIN + HALF_MIN - DAILY_MIN); // +240
      assert.equal(result.leaveDebit?.amount, 0.5);
    });

    it("keeps an open session open when the day is re-marked as a half day", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(false));

      await markAbsence("user1", "12-06", "VACATION", "HALF");

      const upsertArg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.deepEqual(upsertArg.startTime, START_UTC);
      assert.equal(upsertArg.endTime, null);
      assert.equal(upsertArg.workedMinutes, null);
    });

    it("keeps the hours and refunds the vacation debit when a half vacation day becomes a holiday eve", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeHalfVacation("closed"));

      const result = await markAbsence("user1", "12-06", "HOLIDAY_EVE"); // defaults to HALF

      const upsertArg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.equal(upsertArg.absencePortion, "HALF");
      assert.equal(upsertArg.workedMinutes, 240);
      assert.ok(upsertArg.startTime instanceof Date);
      assert.equal(result.leaveRefund?.amount, 0.5);
      assert.equal(result.leaveDebit, null);
    });

    it("clears the hours when a half day becomes a full-day absence", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeHalfVacation("closed"));

      const result = await markAbsence("user1", "12-06", "VACATION", "FULL");

      const upsertArg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.equal(upsertArg.startTime, null);
      assert.equal(upsertArg.expectedEndTime, null);
      assert.equal(upsertArg.endTime, null);
      assert.equal(upsertArg.workedMinutes, 0);
      // 0.5 refunded, then 1 debited
      assert.equal(result.leaveRefund?.amount, 0.5);
      assert.equal(result.leaveDebit?.amount, 1);
    });

    it("does not carry hours onto a fresh half day (no existing record)", async () => {
      await markAbsence("user1", "12-06", "VACATION", "HALF");
      const upsertArg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.equal(upsertArg.startTime, null);
      assert.equal(upsertArg.workedMinutes, 0);
    });
  });

  describe("setStartAndEndHours – turning a half day into a regular work day", () => {
    it("is allowed on a half day and refunds its debit and clears its credit", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeHalfVacation("closed"));

      const result = await setStartAndEndHours("user1", "12-06", "08:00", "16:00");

      assert.equal(result.recordType, "WORK");
      assert.equal(result.leaveRefund?.amount, 0.5);
      const upsertArg = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.equal(upsertArg.absencePortion, null);
      assert.equal(upsertArg.creditedMinutes, 0);
    });
  });

  // ── Chol HaMoed hours ─────────────────────────────────────────────────────────

  describe("Chol HaMoed hours", () => {
    const CH_DATE = "2026-09-28"; // 17 Tishri
    const CH_MIN = 420;
    const CH_SETTINGS = { ...SETTINGS, cholHamoedRequiredMinutes: CH_MIN };

    function onChDate(settings: typeof SETTINGS = CH_SETTINGS) {
      editedDate = CH_DATE;
      mockGetSettingsOrThrow.mock.mockImplementationOnce(async () => settings);
      mockApplyPendingLeaveAccrual.mock.mockImplementationOnce(async () => settings);
    }

    it("markAbsence credits a full vacation day as the Chol HaMoed hours and still debits 1 day", async () => {
      onChDate();

      const result = await markAbsence("user1", "28-09", "VACATION", "FULL");

      assert.equal(result.creditedMinutes, CH_MIN);
      assert.equal(result.requiredMinutes, CH_MIN);
      assert.equal(result.balanceMinutes, 0);
      assert.equal(result.leaveDebit.amount, 1);
    });

    it("markAbsence credits a half vacation day as half the Chol HaMoed hours", async () => {
      onChDate();

      const result = await markAbsence("user1", "28-09", "VACATION", "HALF");

      assert.equal(result.creditedMinutes, CH_MIN / 2);
      assert.equal(result.leaveDebit.amount, 0.5);
    });

    it("markAbsence uses the normal hours on Chol HaMoed when no override is set", async () => {
      onChDate(SETTINGS);

      const result = await markAbsence("user1", "28-09", "VACATION", "FULL");

      assert.equal(result.creditedMinutes, DAILY_MIN);
    });

    it("setStartAndEndHours computes expectedEndTime and balance from the Chol HaMoed hours", async () => {
      onChDate();

      // 09:00–17:00 Jerusalem = 8h worked against 7h required.
      const result = await setStartAndEndHours("user1", "28-09", "09:00", "17:00");

      const input = mockUpsertRecordByDate.mock.calls[0].arguments[0];
      assert.equal((input.expectedEndTime.getTime() - input.startTime.getTime()) / 60_000, CH_MIN);
      assert.equal(result.requiredMinutes, CH_MIN);
      assert.equal(result.balanceMinutes, 480 - CH_MIN);
    });

    it("setEndHour reports the Chol HaMoed hours as requiredMinutes", async () => {
      onChDate();
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(false));

      const result = await setEndHour("user1", "28-09", "17:00");

      assert.equal(result.requiredMinutes, CH_MIN);
    });

    it("setHoursOnHalfDay covers the Chol HaMoed hours minus the half-day credit", async () => {
      onChDate();
      const record = { ...makeHalfVacation("none"), creditedMinutes: CH_MIN / 2 };
      mockFindRecordByDate.mock.mockImplementationOnce(async () => record);
      mockUpdateDailyRecord.mock.mockImplementationOnce(
        async (_id: string, updates: Record<string, unknown>) => ({ ...record, ...updates })
      );

      const result = await setHoursOnHalfDay("user1", "28-09", "13:00", "16:30");

      const updates = mockUpdateDailyRecord.mock.calls[0].arguments[1];
      assert.equal((updates.expectedEndTime.getTime() - updates.startTime.getTime()) / 60_000, CH_MIN / 2);
      assert.equal(result.requiredMinutes, CH_MIN);
      assert.equal(result.balanceMinutes, 0); // 210 worked + 210 credited − 420
    });
  });
  // ── Work periods ────────────────────────────────────────────────────────────
  //
  // A closed work day with two periods, 09:00-12:00 and 13:00-17:00 local
  // (180 + 240 = 420 minutes worked).

  function makeTwoPeriodDay() {
    return {
      ...makeWorkRecord(true),
      startTime: jlm("09:00"),
      endTime: jlm("17:00"),
      workedMinutes: 420,
    };
  }
  function twoPeriods() {
    return [
      makePeriod(jlm("09:00"), jlm("12:00"), "p1"),
      makePeriod(jlm("13:00"), jlm("17:00"), "p2"),
    ];
  }
  function fourOneHourPeriods() {
    return ["08:00", "10:00", "12:00", "14:00"].map((h, i) =>
      makePeriod(jlm(h), new Date(jlm(h).getTime() + 60 * 60_000), `p${i}`)
    );
  }
  function expectCode(code: string) {
    return (err: unknown) => {
      assert.equal((err as { code: string }).code, code);
      return true;
    };
  }

  describe("getEditDayOptions – work periods", () => {
    it("returns the day's periods and offers add/edit/delete on a closed day", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());

      const opts = await getEditDayOptions("user1", "12-06");

      assert.equal(opts.timezone, TIMEZONE);
      assert.deepEqual(
        opts.periods.map((p: { workedMinutes: number }) => p.workedMinutes),
        [180, 240]
      );
      for (const action of ["ADD_WORK_PERIOD", "EDIT_WORK_PERIOD", "DELETE_WORK_PERIOD"]) {
        assert.ok(opts.allowedActions.includes(action), action);
      }
    });

    it("stops offering ADD_WORK_PERIOD once the day has 4 periods", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => fourOneHourPeriods());

      const opts = await getEditDayOptions("user1", "12-06");

      assert.ok(!opts.allowedActions.includes("ADD_WORK_PERIOD"));
      assert.ok(opts.allowedActions.includes("EDIT_WORK_PERIOD"));
    });

    it("offers no period actions on a half day without hours, and skips the period query", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeHalfVacation("none"));

      const opts = await getEditDayOptions("user1", "12-06");

      assert.deepEqual(opts.periods, []);
      assert.equal(mockListWorkPeriods.mock.calls.length, 0);
      assert.ok(!opts.allowedActions.includes("ADD_WORK_PERIOD"));
      assert.ok(!opts.allowedActions.includes("EDIT_WORK_PERIOD"));
      assert.ok(!opts.allowedActions.includes("DELETE_WORK_PERIOD"));
    });

    it("offers no period actions while a period is open", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(false));

      const opts = await getEditDayOptions("user1", "12-06");

      assert.equal(opts.state, "OPEN_WORK_RECORD");
      assert.ok(!opts.allowedActions.includes("ADD_WORK_PERIOD"));
      assert.ok(!opts.allowedActions.includes("DELETE_WORK_PERIOD"));
    });
  });

  describe("setEndHour – several periods", () => {
    it("closes only the open period and stores the total of all periods", async () => {
      // Period 1 closed 09:00-12:00 (180), period 2 open since 13:00.
      mockFindRecordByDate.mock.mockImplementationOnce(async () => ({
        ...makeWorkRecord(false),
        startTime: jlm("09:00"),
        workedMinutes: 180,
      }));
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(jlm("09:00"), jlm("12:00"), "p1"),
        makePeriod(jlm("13:00"), null, "p2"),
      ]);

      const result = await setEndHour("user1", "12-06", "17:00");

      assert.equal(mockTransaction.mock.calls.length, 1);
      const [periodId, periodInput, periodClient] = mockUpdateWorkPeriod.mock.calls[0].arguments;
      assert.equal(periodId, "p2");
      assert.equal(periodInput.endTime.getTime(), jlm("17:00").getTime());
      assert.equal(periodClient, FAKE_TX);
      assert.equal(mockUpdateDailyRecord.mock.calls[0].arguments[1].workedMinutes, 420);
      assert.equal(mockUpdateDailyRecord.mock.calls[0].arguments[2], FAKE_TX);
      assert.equal(result.workedMinutes, 420);
      assert.equal(result.periods.length, 2);
    });

    it("rejects an end time before the open period's start, even if after the day's first start", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => ({
        ...makeWorkRecord(false),
        startTime: jlm("09:00"),
      }));
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(jlm("09:00"), jlm("12:00"), "p1"),
        makePeriod(jlm("13:00"), null, "p2"),
      ]);

      await assert.rejects(
        () => setEndHour("user1", "12-06", "12:30"),
        expectCode("INVALID_TIME_RANGE")
      );
      assert.equal(mockTransaction.mock.calls.length, 0);
    });
  });

  describe("setStartAndEndHours – replaces every period with one", () => {
    it("deletes the day's periods and creates a single one, in the record's transaction", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());

      const result = await setStartAndEndHours("user1", "12-06", "08:00", "16:00");

      const [deletedFor, deleteClient] = mockDeleteWorkPeriodsOfRecord.mock.calls[0].arguments;
      assert.equal(deletedFor, "r-new");
      assert.equal(deleteClient, FAKE_TX);
      const [created, createClient] = mockCreateWorkPeriod.mock.calls[0].arguments;
      assert.equal(created.startTime.getTime(), jlm("08:00").getTime());
      assert.equal(created.endTime.getTime(), jlm("16:00").getTime());
      assert.equal(createClient, FAKE_TX);
      assert.equal(result.periods.length, 1);
      assert.equal(result.workedMinutes, 480);
    });
  });

  describe("markAbsence – work periods", () => {
    it("deletes the day's periods when a full-day absence clears its hours", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());

      const result = await markAbsence("user1", "12-06", "HOLIDAY");

      assert.equal(mockTransaction.mock.calls.length, 1);
      assert.equal(mockDeleteWorkPeriodsOfRecord.mock.calls[0].arguments[1], FAKE_TX);
      assert.deepEqual(result.periods, []);
    });

    it("keeps the day's periods when it becomes a half day", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());

      const result = await markAbsence("user1", "12-06", "VACATION", "HALF");

      assert.equal(mockDeleteWorkPeriodsOfRecord.mock.calls.length, 0);
      assert.equal(result.periods.length, 2);
    });

    it("writes nothing to periods when the date had no hours", async () => {
      await markAbsence("user1", "12-06", "HOLIDAY");

      assert.equal(mockDeleteWorkPeriodsOfRecord.mock.calls.length, 0);
      assert.equal(mockTransaction.mock.calls.length, 0);
    });
  });

  describe("addWorkPeriod", () => {
    it("adds a period and updates the day's first start, last end and total", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());

      const result = await addWorkPeriod("user1", "12-06", "18:00", "19:30");

      assert.equal(mockTransaction.mock.calls.length, 1);
      const [created, createClient] = mockCreateWorkPeriod.mock.calls[0].arguments;
      assert.equal(created.dailyRecordId, "r1");
      assert.equal(createClient, FAKE_TX);
      const [, recordInput, recordClient] = mockUpdateDailyRecord.mock.calls[0].arguments;
      assert.equal(recordClient, FAKE_TX);
      assert.equal(recordInput.startTime.getTime(), jlm("09:00").getTime());
      assert.equal(recordInput.endTime.getTime(), jlm("19:30").getTime());
      assert.equal(recordInput.workedMinutes, 420 + 90);
      assert.equal(result.periods.length, 3);
      assert.equal(result.workedMinutes, 510);
    });

    it("lists a period added before the others first", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());

      const result = await addWorkPeriod("user1", "12-06", "07:00", "08:30");

      assert.equal(result.periods[0].startTime, jlm("07:00").toISOString());
      assert.equal(
        mockUpdateDailyRecord.mock.calls[0].arguments[1].startTime.getTime(),
        jlm("07:00").getTime()
      );
    });

    it("accepts a period that starts exactly when another ends", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());

      const result = await addWorkPeriod("user1", "12-06", "12:00", "13:00");

      assert.equal(result.workedMinutes, 480);
    });

    it("rejects a period that overlaps an existing one, naming it, and writes nothing", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());

      await assert.rejects(
        () => addWorkPeriod("user1", "12-06", "11:00", "13:30"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "INVALID_TIME_RANGE");
          assert.match((err as Error).message, /work period 1 \(09:00/);
          return true;
        }
      );
      assert.equal(mockTransaction.mock.calls.length, 0);
    });

    it("rejects an end before the start", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());

      await assert.rejects(
        () => addWorkPeriod("user1", "12-06", "19:00", "18:00"),
        expectCode("INVALID_TIME_RANGE")
      );
    });

    it("throws WORK_PERIOD_LIMIT_REACHED when the day already has 4 periods", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => fourOneHourPeriods());

      await assert.rejects(
        () => addWorkPeriod("user1", "12-06", "18:00", "19:00"),
        expectCode("WORK_PERIOD_LIMIT_REACHED")
      );
      assert.equal(mockTransaction.mock.calls.length, 0);
    });

    it("throws CONFLICT on a date without hours and on an open day", async () => {
      await assert.rejects(
        () => addWorkPeriod("user1", "12-06", "18:00", "19:00"),
        expectCode("CONFLICT")
      );

      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(false));
      await assert.rejects(
        () => addWorkPeriod("user1", "12-06", "18:00", "19:00"),
        expectCode("CONFLICT")
      );
    });

    it("adds to a half day with hours, keeping its credit in the expected end", async () => {
      const halfDay = makeHalfVacation("closed"); // 13:00-17:00 worked, 240 credited
      mockFindRecordByDate.mock.mockImplementationOnce(async () => halfDay);
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(halfDay.startTime!, halfDay.endTime, "p1", halfDay.id),
      ]);

      await addWorkPeriod("user1", "12-06", "18:00", "19:00");

      const recordInput = mockUpdateDailyRecord.mock.calls[0].arguments[1];
      assert.equal(recordInput.workedMinutes, 300);
      // first start (13:00) + (480 required - 240 credited)
      assert.equal(
        recordInput.expectedEndTime.getTime() - recordInput.startTime.getTime(),
        240 * 60_000
      );
    });
  });

  describe("editWorkPeriod", () => {
    it("changes one period's times and updates the day's total", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());

      const result = await editWorkPeriod("user1", "12-06", 2, "14:00", "18:00");

      const [periodId, periodInput, periodClient] = mockUpdateWorkPeriod.mock.calls[0].arguments;
      assert.equal(periodId, "p2");
      assert.equal(periodInput.startTime.getTime(), jlm("14:00").getTime());
      assert.equal(periodClient, FAKE_TX);
      const recordInput = mockUpdateDailyRecord.mock.calls[0].arguments[1];
      assert.equal(recordInput.endTime.getTime(), jlm("18:00").getTime());
      assert.equal(recordInput.workedMinutes, 180 + 240);
      assert.equal(result.periods[1].endTime, jlm("18:00").toISOString());
    });

    it("may overlap the period's own old range, but not another period", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());
      await editWorkPeriod("user1", "12-06", 1, "08:00", "12:30");

      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());
      await assert.rejects(
        () => editWorkPeriod("user1", "12-06", 1, "08:00", "13:30"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "INVALID_TIME_RANGE");
          assert.match((err as Error).message, /work period 2 \(13:00/);
          return true;
        }
      );
    });

    it("re-sorts the periods when an edit moves one before another", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());

      const result = await editWorkPeriod("user1", "12-06", 2, "06:00", "08:00");

      assert.equal(result.periods[0].startTime, jlm("06:00").toISOString());
      assert.equal(
        mockUpdateDailyRecord.mock.calls[0].arguments[1].endTime.getTime(),
        jlm("12:00").getTime()
      );
    });

    it("throws VALIDATION_ERROR for a period number the day doesn't have", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());

      await assert.rejects(
        () => editWorkPeriod("user1", "12-06", 3, "18:00", "19:00"),
        expectCode("VALIDATION_ERROR")
      );
      assert.equal(mockTransaction.mock.calls.length, 0);
    });
  });

  describe("removeWorkPeriod", () => {
    it("deletes one period and updates the day from the rest", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeTwoPeriodDay());
      mockListWorkPeriods.mock.mockImplementationOnce(async () => twoPeriods());

      const result = await removeWorkPeriod("user1", "12-06", 1);

      assert.deepEqual(mockDeleteWorkPeriod.mock.calls[0].arguments, ["p1", FAKE_TX]);
      const recordInput = mockUpdateDailyRecord.mock.calls[0].arguments[1];
      assert.equal(recordInput.startTime.getTime(), jlm("13:00").getTime());
      assert.equal(recordInput.workedMinutes, 240);
      assert.equal(result.periods.length, 1);
    });

    it("deletes the whole record when a work day's last period is deleted, and returns null", async () => {
      mockFindRecordByDate.mock.mockImplementationOnce(async () => makeWorkRecord(true));
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(START_UTC, new Date("2026-06-12T14:00:00Z")),
      ]);

      const result = await removeWorkPeriod("user1", "12-06", 1);

      assert.equal(result, null);
      assert.deepEqual(mockDeleteDailyRecord.mock.calls[0].arguments, ["r1"]);
      assert.equal(mockUpdateDailyRecord.mock.calls.length, 0);
    });

    it("keeps a half day's absence and clears its hours when its last period is deleted", async () => {
      const halfDay = makeHalfVacation("closed");
      mockFindRecordByDate.mock.mockImplementationOnce(async () => halfDay);
      mockListWorkPeriods.mock.mockImplementationOnce(async () => [
        makePeriod(halfDay.startTime!, halfDay.endTime, "p1", halfDay.id),
      ]);
      mockUpdateDailyRecord.mock.mockImplementationOnce(
        async (_id: string, updates: Record<string, unknown>) => ({ ...halfDay, ...updates })
      );

      const result = await removeWorkPeriod("user1", "12-06", 1);

      assert.equal(mockDeleteDailyRecord.mock.calls.length, 0);
      assert.deepEqual(mockUpdateDailyRecord.mock.calls[0].arguments[1], {
        startTime: null,
        expectedEndTime: null,
        endTime: null,
        workedMinutes: 0,
      });
      assert.equal(result.recordType, "VACATION");
      assert.equal(result.creditedMinutes, HALF_MIN);
      assert.deepEqual(result.periods, []);
    });
  });
});
