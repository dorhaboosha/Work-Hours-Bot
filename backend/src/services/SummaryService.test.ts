import { describe, it, mock, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { Module } from "node:module";
// NOTE: SummaryService is NOT imported at the top level because it transitively
// loads DailyRecordRepository → PrismaClient → Env (which validates env vars).
// All service functions are loaded dynamically inside before() after stubs are
// injected — the same pattern used in SettingsService.test.ts.

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

// ── Shared test data ───────────────────────────────────────────────────────────

const TIMEZONE = "Asia/Jerusalem";
const DAILY_MIN = 480;
// June 10, 2026 (Wednesday) — lies inside the week Sun Jun 7 – Sat Jun 13
const REF_DATE = "2026-06-10";
const FIXED_TODAY = "2026-06-10";

// Workdays Sun–Thu; in the week of Jun 7: Jun 7,8,9,10,11
const WEEK_DATES = [
  "2026-06-07",
  "2026-06-08",
  "2026-06-09",
  "2026-06-10",
  "2026-06-11",
];

const SETTINGS = {
  id: "s1",
  telegramId: "u1",
  dailyRequiredMinutes: DAILY_MIN,
  timezone: TIMEZONE,
  workdays: [0, 1, 2, 3, 4],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeClosedRecord(dateStr: string, workedMinutes: number) {
  return {
    id: `r-${dateStr}`,
    telegramId: "u1",
    workDate: new Date(`${dateStr}T00:00:00Z`),
    recordType: "WORK",
    startTime: new Date(`${dateStr}T06:00:00Z`),
    expectedEndTime: new Date(`${dateStr}T14:00:00Z`),
    endTime: new Date(`${dateStr}T14:00:00Z`),
    workedMinutes,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeAbsenceRecord(
  dateStr: string,
  recordType: string,
  workedMinutes: number
) {
  return {
    id: `r-abs-${dateStr}`,
    telegramId: "u1",
    workDate: new Date(`${dateStr}T00:00:00Z`),
    recordType,
    startTime: null,
    expectedEndTime: null,
    endTime: null,
    workedMinutes,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeOpenRecord(dateStr: string) {
  return {
    id: `r-open-${dateStr}`,
    telegramId: "u1",
    workDate: new Date(`${dateStr}T00:00:00Z`),
    recordType: "WORK",
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // started 2 h ago
    expectedEndTime: new Date(Date.now() + 6 * 60 * 60 * 1000),
    endTime: null,
    workedMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ── All tests in one suite (single before() for stub setup) ──────────────────

describe("SummaryService", async () => {
  // Pure functions (window computation + aggregation)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aggregateSummary: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getWeekWindow: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getMonthWindow: any;
  // Service functions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getWeekSummary: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getMonthSummary: any;
  // Mocks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockListRecords: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockFindOpenRecord: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockGetSettingsOrThrow: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockGetLocalDate: ReturnType<typeof mock.fn<any>>;

  before(() => {
    mockListRecords = mock.fn(async () => []);
    mockFindOpenRecord = mock.fn(async () => null);
    mockGetSettingsOrThrow = mock.fn(async () => SETTINGS);
    mockGetLocalDate = mock.fn(() => FIXED_TODAY);

    // ── Inject repository stub ────────────────────────────────────────────────
    const repoKey = require.resolve(
      path.join(__dirname, "../repositories/DailyRecordRepository")
    );
    injectCacheStub(repoKey, {
      listRecordsByRange: mockListRecords,
      findOpenRecord: mockFindOpenRecord,
    });

    // ── Inject SettingsService stub ───────────────────────────────────────────
    const settingsKey = require.resolve(
      path.join(__dirname, "./SettingsService")
    );
    injectCacheStub(settingsKey, {
      getSettingsOrThrow: mockGetSettingsOrThrow,
    });

    // ── Inject DateUtils stub (keep real impls, mock only getLocalDate) ───────
    const dateUtilsKey = require.resolve(
      path.join(__dirname, "../utils/DateUtils")
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const realDateUtils = require(dateUtilsKey) as typeof import("../utils/DateUtils");
    injectCacheStub(dateUtilsKey, {
      getLocalDate: mockGetLocalDate,
      utcToLocalDate: realDateUtils.utcToLocalDate,
      utcToLocalTime: realDateUtils.utcToLocalTime,
      manualEndTimeToUtc: realDateUtils.manualEndTimeToUtc,
      addMinutesUtc: realDateUtils.addMinutesUtc,
      minutesBetween: realDateUtils.minutesBetween,
    });

    // ── Load SummaryService fresh after all stubs are in place ────────────────
    const svcKey = require.resolve(path.join(__dirname, "./SummaryService"));
    delete require.cache[svcKey];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const svc = require(svcKey) as typeof import("./SummaryService");
    aggregateSummary = svc.aggregateSummary;
    getWeekWindow = svc.getWeekWindow;
    getMonthWindow = svc.getMonthWindow;
    getWeekSummary = svc.getWeekSummary;
    getMonthSummary = svc.getMonthSummary;
  });

  afterEach(() => {
    mockListRecords?.mock.resetCalls();
    mockFindOpenRecord?.mock.resetCalls();
    mockGetSettingsOrThrow?.mock.resetCalls();
    mockGetLocalDate?.mock.resetCalls();
  });

  // ── getWeekWindow ─────────────────────────────────────────────────────────────

  describe("getWeekWindow", () => {
    it("returns the Sun–Sat week containing the reference date", () => {
      const w = getWeekWindow([0, 1, 2, 3, 4], TIMEZONE, REF_DATE);
      assert.equal(w.calendarStart, "2026-06-07");
      assert.equal(w.calendarEnd, "2026-06-13");
    });

    it("includes only configured workdays", () => {
      const w = getWeekWindow([0, 1, 2, 3, 4], TIMEZONE, REF_DATE);
      assert.deepEqual(w.workdayDates, WEEK_DATES);
    });

    it("sets startDate / endDate to first and last workday", () => {
      const w = getWeekWindow([0, 1, 2, 3, 4], TIMEZONE, REF_DATE);
      assert.equal(w.startDate, "2026-06-07");
      assert.equal(w.endDate, "2026-06-11");
    });

    it("handles Mon–Fri schedule in the same week", () => {
      const w = getWeekWindow([1, 2, 3, 4, 5], TIMEZONE, REF_DATE);
      assert.equal(w.workdayDates[0], "2026-06-08"); // Mon
      assert.equal(w.workdayDates[4], "2026-06-12"); // Fri
    });

    it("works when reference date is a Sunday (start of week)", () => {
      const w = getWeekWindow([0, 1, 2, 3, 4], TIMEZONE, "2026-06-07");
      assert.equal(w.calendarStart, "2026-06-07");
      assert.equal(w.calendarEnd, "2026-06-13");
    });

    it("works when reference date is a Saturday (end of week)", () => {
      const w = getWeekWindow([0, 1, 2, 3, 4], TIMEZONE, "2026-06-13");
      assert.equal(w.calendarStart, "2026-06-07");
      assert.equal(w.calendarEnd, "2026-06-13");
    });
  });

  // ── getMonthWindow ────────────────────────────────────────────────────────────

  describe("getMonthWindow", () => {
    it("covers all days of June 2026", () => {
      const w = getMonthWindow([0, 1, 2, 3, 4], TIMEZONE, "2026-06");
      assert.equal(w.month, "2026-06");
      assert.equal(w.startDate, "2026-06-01");
      assert.equal(w.endDate, "2026-06-30");
    });

    it("returns 22 workdays for Sun–Thu schedule in June 2026", () => {
      // 4 Sundays + 5 Mondays + 5 Tuesdays + 4 Wednesdays + 4 Thursdays = 22
      const w = getMonthWindow([0, 1, 2, 3, 4], TIMEZONE, "2026-06");
      assert.equal(w.workdayDates.length, 22);
    });

    it("starts on June 1 (Monday) for Mon–Fri schedule", () => {
      const w = getMonthWindow([1, 2, 3, 4, 5], TIMEZONE, "2026-06");
      assert.equal(w.workdayDates[0], "2026-06-01");
    });

    it("handles February in a leap year (Feb 2024 ends on the 29th)", () => {
      const w = getMonthWindow([1, 2, 3, 4, 5], "UTC", "2024-02");
      assert.equal(w.endDate, "2024-02-29");
      assert.ok(w.workdayDates.length > 0);
    });
  });

  // ── aggregateSummary ──────────────────────────────────────────────────────────

  describe("aggregateSummary", () => {
    it("sums workedMinutes across all closed records", () => {
      const records = WEEK_DATES.map((d) => makeClosedRecord(d, 480));
      const result = aggregateSummary(WEEK_DATES, records, DAILY_MIN, TIMEZONE);
      assert.equal(result.workdaysCount, 5);
      assert.equal(result.requiredMinutes, 2400);
      assert.equal(result.workedMinutes, 2400);
      assert.equal(result.balanceMinutes, 0);
    });

    it("counts missing days as 0 worked", () => {
      const records = WEEK_DATES.slice(0, 3).map((d) => makeClosedRecord(d, 480));
      const result = aggregateSummary(WEEK_DATES, records, DAILY_MIN, TIMEZONE);
      assert.equal(result.workedMinutes, 3 * 480);
      assert.equal(result.balanceMinutes, -2 * 480);
    });

    it("uses pre-filled workedMinutes for an open record (worked-so-far)", () => {
      const closed = WEEK_DATES.slice(0, 4).map((d) => makeClosedRecord(d, 480));
      const enrichedOpen = { ...makeOpenRecord(WEEK_DATES[4]), workedMinutes: 120 };
      const result = aggregateSummary(
        WEEK_DATES,
        [...closed, enrichedOpen],
        DAILY_MIN,
        TIMEZONE
      );
      assert.equal(result.workedMinutes, 4 * 480 + 120);
      assert.equal(result.balanceMinutes, 4 * 480 + 120 - 5 * 480);
    });

    it("returns zero worked and negative balance when no records exist", () => {
      const result = aggregateSummary(WEEK_DATES, [], DAILY_MIN, TIMEZONE);
      assert.equal(result.workedMinutes, 0);
      assert.equal(result.balanceMinutes, -5 * DAILY_MIN);
    });

    it("returns all zeros for an empty workdayDates list", () => {
      const result = aggregateSummary([], [], DAILY_MIN, TIMEZONE);
      assert.equal(result.workdaysCount, 0);
      assert.equal(result.requiredMinutes, 0);
      assert.equal(result.workedMinutes, 0);
    });
  });

  // ── aggregateSummary – absence credits ────────────────────────────────────────

  describe("aggregateSummary – absence credits", () => {
    it("credits SICK as full day: worked = required = dailyRequiredMinutes → balance 0", () => {
      const records = [
        makeAbsenceRecord(WEEK_DATES[0], "SICK", DAILY_MIN),
        ...WEEK_DATES.slice(1).map((d) => makeClosedRecord(d, DAILY_MIN)),
      ];
      const r = aggregateSummary(WEEK_DATES, records, DAILY_MIN, TIMEZONE);
      // 1 SICK day: +DAILY_MIN worked, +DAILY_MIN required (credited = required)
      // 4 WORK days: +DAILY_MIN each
      assert.equal(r.workedMinutes, 5 * DAILY_MIN);
      assert.equal(r.requiredMinutes, 5 * DAILY_MIN);
      assert.equal(r.balanceMinutes, 0);
    });

    it("credits VACATION as full day (same as SICK)", () => {
      const records = [
        makeAbsenceRecord(WEEK_DATES[0], "VACATION", DAILY_MIN),
        ...WEEK_DATES.slice(1).map((d) => makeClosedRecord(d, DAILY_MIN)),
      ];
      const r = aggregateSummary(WEEK_DATES, records, DAILY_MIN, TIMEZONE);
      assert.equal(r.workedMinutes, 5 * DAILY_MIN);
      assert.equal(r.balanceMinutes, 0);
    });

    it("credits HOLIDAY_EVE as half day: worked = 4*full+half, required = 5*full → balance negative", () => {
      const halfCredit = Math.floor(DAILY_MIN / 2); // 240
      const records = [
        makeAbsenceRecord(WEEK_DATES[0], "HOLIDAY_EVE", halfCredit),
        ...WEEK_DATES.slice(1).map((d) => makeClosedRecord(d, DAILY_MIN)),
      ];
      const r = aggregateSummary(WEEK_DATES, records, DAILY_MIN, TIMEZONE);
      assert.equal(r.workedMinutes,   4 * DAILY_MIN + halfCredit); // 1920 + 240 = 2160
      assert.equal(r.requiredMinutes, 5 * DAILY_MIN);              // always full per workday = 2400
      assert.equal(r.balanceMinutes,  4 * DAILY_MIN + halfCredit - 5 * DAILY_MIN); // -240
    });

    it("credits UNPAID_ABSENCE as 0: worked = 4*full, required = 5*full → balance negative", () => {
      const records = [
        makeAbsenceRecord(WEEK_DATES[0], "UNPAID_ABSENCE", 0),
        ...WEEK_DATES.slice(1).map((d) => makeClosedRecord(d, DAILY_MIN)),
      ];
      const r = aggregateSummary(WEEK_DATES, records, DAILY_MIN, TIMEZONE);
      assert.equal(r.workedMinutes,   4 * DAILY_MIN);  // 0 + 4×480 = 1920
      assert.equal(r.requiredMinutes, 5 * DAILY_MIN);  // always full per workday = 2400
      assert.equal(r.balanceMinutes,  -DAILY_MIN);     // 1920 - 2400 = -480
    });

    it("handles a week mixing WORK + SICK + HOLIDAY_EVE + UNPAID_ABSENCE + missing day", () => {
      const halfCredit = Math.floor(DAILY_MIN / 2); // 240
      const records = [
        makeClosedRecord(WEEK_DATES[0], DAILY_MIN),                   // WORK:  +480 worked
        makeAbsenceRecord(WEEK_DATES[1], "SICK",          DAILY_MIN), // SICK:  +480 worked
        makeAbsenceRecord(WEEK_DATES[2], "HOLIDAY_EVE",  halfCredit), // H-EVE: +240 worked
        makeAbsenceRecord(WEEK_DATES[3], "UNPAID_ABSENCE",       0),  // UNPD:  +0   worked
        // WEEK_DATES[4] missing:                                       // MISS:  +0   worked
        // required = 5 × DAILY_MIN for all 5 workdays
      ];
      const r = aggregateSummary(WEEK_DATES, records, DAILY_MIN, TIMEZONE);

      const expectedWorked   = DAILY_MIN + DAILY_MIN + halfCredit + 0 + 0; // 1200
      const expectedRequired = 5 * DAILY_MIN;                               // 2400

      assert.equal(r.workedMinutes,   expectedWorked);
      assert.equal(r.requiredMinutes, expectedRequired);
      assert.equal(r.balanceMinutes,  expectedWorked - expectedRequired); // -1200
    });
  });

  // ── getWeekSummary ────────────────────────────────────────────────────────────

  // NOTE: getWeekSummary no longer accepts a referenceDate; the window is always
  // computed from today in the user's timezone. Integration tests below are therefore
  // date-independent: they verify structure, the balance formula, and the guard.

  describe("getWeekSummary – period metadata", () => {
    it("returns period:week with a valid workdaysCount and zero balance when no records", async () => {
      // listRecords returns [] by default
      const result = await getWeekSummary("u1");
      assert.equal(result.period, "week");
      assert.ok(result.workdaysCount >= 0 && result.workdaysCount <= 7,
        `unexpected workdaysCount ${result.workdaysCount}`);
      assert.equal(result.workedMinutes, 0);
      assert.equal(result.requiredMinutes, result.workdaysCount * DAILY_MIN);
      assert.equal(result.balanceMinutes, -result.requiredMinutes);
    });

    it("balance formula holds: balanceMinutes = workedMinutes - requiredMinutes", async () => {
      const result = await getWeekSummary("u1");
      assert.equal(result.balanceMinutes, result.workedMinutes - result.requiredMinutes);
    });
  });

  describe("getWeekSummary – PREVIOUS_RECORD_STILL_OPEN guard", () => {
    it("throws when a prior-day record is still open", async () => {
      mockFindOpenRecord.mock.mockImplementationOnce(
        async () => makeOpenRecord("2026-06-09") // yesterday vs FIXED_TODAY 2026-06-10
      );
      await assert.rejects(
        () => getWeekSummary("u1"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "PREVIOUS_RECORD_STILL_OPEN");
          return true;
        }
      );
    });

    it("does NOT throw when the open record is from today", async () => {
      mockFindOpenRecord.mock.mockImplementationOnce(
        async () => makeOpenRecord(FIXED_TODAY)
      );
      mockListRecords.mock.mockImplementationOnce(async () => [
        makeOpenRecord(FIXED_TODAY),
      ]);
      const result = await getWeekSummary("u1");
      assert.equal(result.period, "week");
    });
  });

  // ── getMonthSummary ───────────────────────────────────────────────────────────

  // NOTE: getMonthSummary no longer accepts a referenceMonth; the window is always
  // computed from today in the user's timezone. Integration tests below are therefore
  // date-independent.

  describe("getMonthSummary – period metadata", () => {
    it("returns period:month with a valid workdaysCount and zero balance when no records", async () => {
      // listRecords returns [] by default
      const result = await getMonthSummary("u1");
      assert.equal(result.period, "month");
      assert.ok(typeof result.month === "string" && /^\d{4}-\d{2}$/.test(result.month),
        `unexpected month format "${result.month}"`);
      assert.ok(result.workdaysCount >= 0 && result.workdaysCount <= 31,
        `unexpected workdaysCount ${result.workdaysCount}`);
      assert.equal(result.workedMinutes, 0);
      assert.equal(result.requiredMinutes, result.workdaysCount * DAILY_MIN);
      assert.equal(result.balanceMinutes, -result.requiredMinutes);
    });

    it("balance formula holds: balanceMinutes = workedMinutes - requiredMinutes", async () => {
      const result = await getMonthSummary("u1");
      assert.equal(result.balanceMinutes, result.workedMinutes - result.requiredMinutes);
    });
  });

  describe("getMonthSummary – PREVIOUS_RECORD_STILL_OPEN guard", () => {
    it("throws when a prior-day record is still open", async () => {
      mockFindOpenRecord.mock.mockImplementationOnce(
        async () => makeOpenRecord("2026-05-31") // previous month
      );
      await assert.rejects(
        () => getMonthSummary("u1"),
        (err: unknown) => {
          assert.equal((err as { code: string }).code, "PREVIOUS_RECORD_STILL_OPEN");
          return true;
        }
      );
    });
  });
});
