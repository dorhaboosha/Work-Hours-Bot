import { describe, it, mock, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { Module } from "node:module";

// Same require.cache stub-injection convention as SettingsService.test.ts /
// EditWorkdayService.test.ts. accrualUtils is stubbed too (not just the
// repository) so these tests are fully decoupled from the real wall clock —
// computeLeaveAccrualCatchUp's actual date logic is covered separately in
// accrualUtils.test.ts.
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

const SETTINGS: Record<string, unknown> = {
  id: "s1",
  telegramId: "user1",
  dailyRequiredMinutes: 480,
  timezone: "UTC",
  workdays: [0, 1, 2, 3, 4],
  vacationAccrualRate: 1,
  sickAccrualRate: 1.5,
  vacationBalance: 3,
  sickBalance: 4.5,
  accrualAnchorAt: new Date("2026-01-01T00:00:00.000Z"),
  accrualAppliedThrough: new Date("2026-06-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

describe("LeaveBalanceService", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let applyPendingLeaveAccrual: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getLeaveBalance: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockGetSettingsOrThrow: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockApplyLeaveAccrual: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockComputeCatchUp: ReturnType<typeof mock.fn<any>>;

  before(() => {
    mockGetSettingsOrThrow = mock.fn(async (_telegramId: string) => SETTINGS);
    mockApplyLeaveAccrual = mock.fn(
      async (_telegramId: string, _catchUp: unknown) => ({
        ...SETTINGS,
        vacationBalance: 5,
        sickBalance: 7.5,
      })
    );
    mockComputeCatchUp = mock.fn(() => ({
      accrualAnchorAt: SETTINGS.accrualAnchorAt as Date,
      accrualAppliedThrough: SETTINGS.accrualAppliedThrough as Date,
      vacationDelta: 0,
      sickDelta: 0,
      changed: false,
    }));

    const settingsServiceKey = require.resolve(
      path.join(__dirname, "../services/SettingsService")
    );
    injectCacheStub(settingsServiceKey, {
      getSettingsOrThrow: mockGetSettingsOrThrow,
    });

    const repoKey = require.resolve(
      path.join(__dirname, "../repositories/UserSettingsRepository")
    );
    injectCacheStub(repoKey, {
      applyLeaveAccrual: mockApplyLeaveAccrual,
    });

    const accrualUtilsKey = require.resolve(
      path.join(__dirname, "../utils/accrualUtils")
    );
    injectCacheStub(accrualUtilsKey, {
      computeLeaveAccrualCatchUp: mockComputeCatchUp,
    });

    const svcKey = require.resolve(
      path.join(__dirname, "../services/LeaveBalanceService")
    );
    delete require.cache[svcKey];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const svc = require(svcKey) as typeof import("./LeaveBalanceService");
    applyPendingLeaveAccrual = svc.applyPendingLeaveAccrual;
    getLeaveBalance = svc.getLeaveBalance;
  });

  afterEach(() => {
    mockGetSettingsOrThrow?.mock.resetCalls();
    mockApplyLeaveAccrual?.mock.resetCalls();
    mockComputeCatchUp?.mock.resetCalls();
  });

  describe("applyPendingLeaveAccrual — no-op case", () => {
    it("returns the settings unchanged and never calls applyLeaveAccrual when changed=false", async () => {
      const result = await applyPendingLeaveAccrual("user1");

      assert.deepEqual(result, SETTINGS);
      assert.equal(mockApplyLeaveAccrual.mock.calls.length, 0);
    });
  });

  describe("applyPendingLeaveAccrual — accrual owed", () => {
    it("persists the catch-up via applyLeaveAccrual and returns its result", async () => {
      mockComputeCatchUp.mock.mockImplementationOnce(() => ({
        accrualAnchorAt: new Date("2026-01-01T00:00:00.000Z"),
        accrualAppliedThrough: new Date("2026-07-01T00:00:00.000Z"),
        vacationDelta: 1,
        sickDelta: 1.5,
        changed: true,
      }));

      const result = await applyPendingLeaveAccrual("user1");

      assert.equal(mockApplyLeaveAccrual.mock.calls.length, 1);
      assert.equal(mockApplyLeaveAccrual.mock.calls[0].arguments[0], "user1");
      assert.equal(mockApplyLeaveAccrual.mock.calls[0].arguments[1].vacationDelta, 1);
      assert.equal(mockApplyLeaveAccrual.mock.calls[0].arguments[1].sickDelta, 1.5);
      assert.equal(result.vacationBalance, 5);
      assert.equal(result.sickBalance, 7.5);
    });

    it("also persists when only the accrual anchor was just initialized (deltas 0, changed=true)", async () => {
      mockComputeCatchUp.mock.mockImplementationOnce(() => ({
        accrualAnchorAt: new Date("2026-06-10T00:00:00.000Z"),
        accrualAppliedThrough: new Date("2026-06-01T00:00:00.000Z"),
        vacationDelta: 0,
        sickDelta: 0,
        changed: true,
      }));

      await applyPendingLeaveAccrual("user1");

      assert.equal(mockApplyLeaveAccrual.mock.calls.length, 1);
    });
  });

  describe("getLeaveBalance", () => {
    it("returns vacationBalance/sickBalance from the post-accrual settings", async () => {
      mockComputeCatchUp.mock.mockImplementationOnce(() => ({
        accrualAnchorAt: SETTINGS.accrualAnchorAt as Date,
        accrualAppliedThrough: SETTINGS.accrualAppliedThrough as Date,
        vacationDelta: 0,
        sickDelta: 0,
        changed: false,
      }));

      const result = await getLeaveBalance("user1");

      assert.deepEqual(result, { vacationBalance: 3, sickBalance: 4.5 });
    });

    it("reflects newly-accrued balances when accrual was owed", async () => {
      mockComputeCatchUp.mock.mockImplementationOnce(() => ({
        accrualAnchorAt: new Date("2026-01-01T00:00:00.000Z"),
        accrualAppliedThrough: new Date("2026-07-01T00:00:00.000Z"),
        vacationDelta: 1,
        sickDelta: 1.5,
        changed: true,
      }));

      const result = await getLeaveBalance("user1");

      assert.deepEqual(result, { vacationBalance: 5, sickBalance: 7.5 });
    });
  });
});
