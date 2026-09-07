/**
 * Integration tests for the leave-accrual optimistic-concurrency guard, run
 * against a real Postgres (see backend/src/test-helpers/integrationDb.ts).
 *
 * This codebase has no scheduler — accrual is caught up lazily whenever a
 * balance is touched (see LeaveBalanceService.applyPendingLeaveAccrual), so
 * two Telegram updates arriving close together (e.g. /balance and a
 * MARK_ABSENCE edit) can genuinely race to apply the same owed month. The
 * unit tests mock the repository entirely and so can't exercise the actual
 * conditional UPDATE that prevents a double-credit; these tests fire real
 * concurrent requests against Postgres to prove it.
 *
 * Run with: npm run test:integration (requires the docker-compose Postgres).
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { applyPendingLeaveAccrual } from "@/services/LeaveBalanceService";
import { applyLeaveAccrual } from "@/repositories/UserSettingsRepository";
import { prisma } from "@/config/PrismaClient";
import {
  createTestSettings,
  cleanupTestUser,
  assertSafeTestDatabase,
} from "@/test-helpers/integrationDb";

describe("Leave accrual — optimistic concurrency (integration)", () => {
  before(assertSafeTestDatabase);

  it("applyPendingLeaveAccrual never double-credits when two calls race for the same user", async () => {
    // Anchor one full calendar month ago (UTC) so exactly one month is owed.
    const now = new Date();
    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 5));
    const appliedThrough = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

    const settings = await createTestSettings({
      vacationAccrualRate: 1,
      sickAccrualRate: 1.5,
      vacationBalance: 5,
      sickBalance: 5,
      accrualAnchorAt: anchor,
      accrualAppliedThrough: appliedThrough,
    });
    const telegramId = settings.telegramId;

    try {
      // Two genuinely concurrent calls — each does its own read-then-write
      // round trip to Postgres, so they can interleave exactly like two
      // separate Telegram updates arriving close together.
      const [a, b] = await Promise.all([
        applyPendingLeaveAccrual(telegramId),
        applyPendingLeaveAccrual(telegramId),
      ]);

      // Exactly one month's worth of accrual applied in total, regardless of
      // how the two calls interleaved — not two months' worth.
      assert.equal(a.vacationBalance, 6);
      assert.equal(b.vacationBalance, 6);
      assert.equal(a.sickBalance, 6.5);
      assert.equal(b.sickBalance, 6.5);

      const final = await prisma.userSettings.findUniqueOrThrow({ where: { telegramId } });
      assert.equal(final.vacationBalance, 6);
      assert.equal(final.sickBalance, 6.5);
    } finally {
      await cleanupTestUser(telegramId);
    }
  });

  it("applyLeaveAccrual's conditional write matches only one of two racing writers with the same expectedPrevious", async () => {
    const settings = await createTestSettings({ vacationBalance: 0, sickBalance: 0 });
    const telegramId = settings.telegramId;

    try {
      const expectedPrevious = {
        accrualAnchorAt: settings.accrualAnchorAt,
        accrualAppliedThrough: settings.accrualAppliedThrough,
      };
      const catchUp = {
        accrualAnchorAt: settings.accrualAnchorAt as Date,
        accrualAppliedThrough: new Date(),
        vacationDelta: 1,
        sickDelta: 1.5,
      };

      const [a, b] = await Promise.all([
        applyLeaveAccrual(telegramId, catchUp, expectedPrevious),
        applyLeaveAccrual(telegramId, catchUp, expectedPrevious),
      ]);

      const winners = [a, b].filter((r) => r !== null);
      const losers = [a, b].filter((r) => r === null);
      assert.equal(winners.length, 1, "exactly one racing write should match its expectedPrevious");
      assert.equal(losers.length, 1, "exactly one racing write should find the row already moved");
      assert.equal(winners[0]!.vacationBalance, 1);
      assert.equal(winners[0]!.sickBalance, 1.5);

      // The delta was applied exactly once, not twice.
      const final = await prisma.userSettings.findUniqueOrThrow({ where: { telegramId } });
      assert.equal(final.vacationBalance, 1);
      assert.equal(final.sickBalance, 1.5);
    } finally {
      await cleanupTestUser(telegramId);
    }
  });
});
