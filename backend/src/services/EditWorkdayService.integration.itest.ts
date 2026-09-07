/**
 * Integration tests for EditWorkdayService's refund/debit transactions,
 * run against a real Postgres (see backend/src/test-helpers/integrationDb.ts).
 *
 * EditWorkdayService.test.ts (the unit test) mocks prisma.$transaction
 * entirely, so it can verify the *inputs* to each write but never the actual
 * atomic behavior or the numeric chain across repeated edits of the same
 * date. This file exercises the real thing: the exact sequence that would
 * silently corrupt a real vacation/sick balance if the refund-then-debit
 * logic ever regressed.
 *
 * Run with: npm run test:integration (requires the docker-compose Postgres).
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { markAbsence, setStartAndEndHours } from "@/services/EditWorkdayService";
import { prisma } from "@/config/PrismaClient";
import { AppError } from "@/utils/AppError";
import {
  createTestSettings,
  cleanupTestUser,
  assertSafeTestDatabase,
} from "@/test-helpers/integrationDb";

/** Any valid dd-mm — the exact calendar date doesn't matter for these assertions. */
const DATE = "15-06";

describe("EditWorkdayService — leave balance refund/debit transactions (integration)", () => {
  before(assertSafeTestDatabase);

  it("refunds the previous debit and applies the new one atomically across a VACATION -> SICK -> WORK chain", async () => {
    const settings = await createTestSettings({ vacationBalance: 10, sickBalance: 8 });
    const telegramId = settings.telegramId;

    try {
      // 1. Mark VACATION, debiting 2 days.
      const marked1 = await markAbsence(telegramId, DATE, "VACATION", 2);
      assert.deepEqual(marked1.leaveDebit, {
        field: "vacationBalance",
        amount: 2,
        newBalance: 8,
      });
      assert.equal(marked1.leaveRefund, null);

      let row = await prisma.dailyRecord.findFirst({ where: { telegramId } });
      assert.equal(row?.recordType, "VACATION");
      assert.equal(row?.debitedLeaveField, "vacationBalance");
      assert.equal(row?.debitedLeaveDays, 2);
      assert.equal(row?.workedMinutes, 480);

      let liveSettings = await prisma.userSettings.findUniqueOrThrow({ where: { telegramId } });
      assert.equal(liveSettings.vacationBalance, 8);
      assert.equal(liveSettings.sickBalance, 8);

      // 2. Re-mark the same date as SICK, debiting 1 day — must refund the
      // vacation debit and apply the new sick debit in one transaction.
      const marked2 = await markAbsence(telegramId, DATE, "SICK", 1);
      assert.deepEqual(marked2.leaveRefund, {
        field: "vacationBalance",
        amount: 2,
        newBalance: 10,
      });
      assert.deepEqual(marked2.leaveDebit, {
        field: "sickBalance",
        amount: 1,
        newBalance: 7,
      });

      row = await prisma.dailyRecord.findFirst({ where: { telegramId } });
      assert.equal(row?.recordType, "SICK");
      assert.equal(row?.debitedLeaveField, "sickBalance");
      assert.equal(row?.debitedLeaveDays, 1);

      liveSettings = await prisma.userSettings.findUniqueOrThrow({ where: { telegramId } });
      assert.equal(liveSettings.vacationBalance, 10);
      assert.equal(liveSettings.sickBalance, 7);

      // 3. Convert the same date to actual worked hours — must refund the
      // sick debit and leave the record with no debit at all.
      const worked = await setStartAndEndHours(telegramId, DATE, "09:00", "17:00");
      assert.deepEqual(worked.leaveRefund, {
        field: "sickBalance",
        amount: 1,
        newBalance: 8,
      });

      row = await prisma.dailyRecord.findFirst({ where: { telegramId } });
      assert.equal(row?.recordType, "WORK");
      assert.equal(row?.debitedLeaveField, null);
      assert.equal(row?.debitedLeaveDays, null);
      assert.equal(row?.workedMinutes, 480);

      // 4. End-to-end correctness: after debit -> refund -> debit -> refund,
      // both balances must land back exactly where they started. This is
      // the assertion that would catch a leak or a double-count.
      liveSettings = await prisma.userSettings.findUniqueOrThrow({ where: { telegramId } });
      assert.equal(liveSettings.vacationBalance, 10);
      assert.equal(liveSettings.sickBalance, 8);
    } finally {
      await cleanupTestUser(telegramId);
    }
  });

  it("refunds without applying a new debit when changing to a non-debitable absence type", async () => {
    const settings = await createTestSettings({ vacationBalance: 10, sickBalance: 10 });
    const telegramId = settings.telegramId;

    try {
      await markAbsence(telegramId, DATE, "VACATION", 3);

      // ELECTION debits nothing — the previous VACATION debit must still be refunded.
      const marked = await markAbsence(telegramId, DATE, "ELECTION");
      assert.equal(marked.leaveDebit, null);
      assert.deepEqual(marked.leaveRefund, {
        field: "vacationBalance",
        amount: 3,
        newBalance: 10,
      });

      const row = await prisma.dailyRecord.findFirst({ where: { telegramId } });
      assert.equal(row?.recordType, "ELECTION");
      assert.equal(row?.debitedLeaveField, null);
      assert.equal(row?.debitedLeaveDays, null);
      assert.equal(row?.workedMinutes, 480); // ELECTION credits a full day

      const liveSettings = await prisma.userSettings.findUniqueOrThrow({ where: { telegramId } });
      assert.equal(liveSettings.vacationBalance, 10);
      assert.equal(liveSettings.sickBalance, 10);
    } finally {
      await cleanupTestUser(telegramId);
    }
  });

  it("rejects a debitable absence type without debitDays and writes nothing", async () => {
    const settings = await createTestSettings();
    const telegramId = settings.telegramId;

    try {
      await assert.rejects(
        () => markAbsence(telegramId, DATE, "VACATION"),
        (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR"
      );

      const row = await prisma.dailyRecord.findFirst({ where: { telegramId } });
      assert.equal(row, null);

      const liveSettings = await prisma.userSettings.findUniqueOrThrow({ where: { telegramId } });
      assert.equal(liveSettings.vacationBalance, settings.vacationBalance);
    } finally {
      await cleanupTestUser(telegramId);
    }
  });
});
