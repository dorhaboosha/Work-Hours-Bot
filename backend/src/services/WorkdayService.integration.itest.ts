/**
 * Integration tests for multiple work periods per day, run against a real
 * Postgres (see backend/src/test-helpers/integrationDb.ts).
 *
 * The unit tests mock the repositories and prisma.$transaction, so they can't
 * prove the record and its periods are actually written together. These
 * tests drive startWorkday/endWorkday/getTodayStatus end to end and check
 * the stored rows.
 *
 * Run with: npm run test:integration (requires the docker-compose Postgres).
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { startWorkday, endWorkday, getTodayStatus } from "@/services/WorkdayService";
import { prisma } from "@/config/PrismaClient";
import {
  createTestSettings,
  cleanupTestUser,
  assertSafeTestDatabase,
} from "@/test-helpers/integrationDb";

const MIN = 60_000;

/**
 * Moves a record's open period (and the record's own start, when it's the
 * first period) `minutes` into the past — simulates time passing between
 * /start and /end without the test having to wait.
 */
async function backdateOpenPeriod(recordId: string, minutes: number): Promise<void> {
  const open = await prisma.workPeriod.findFirstOrThrow({
    where: { dailyRecordId: recordId, endTime: null },
  });
  const startTime = new Date(open.startTime.getTime() - minutes * MIN);
  await prisma.workPeriod.update({ where: { id: open.id }, data: { startTime } });
  const periodCount = await prisma.workPeriod.count({ where: { dailyRecordId: recordId } });
  if (periodCount === 1) {
    await prisma.dailyRecord.update({ where: { id: recordId }, data: { startTime } });
  }
}

describe("Work periods — start/end/status (integration)", () => {
  before(assertSafeTestDatabase);

  it("logs two periods on one day and stores their total on the record", async () => {
    const settings = await createTestSettings({ dailyRequiredMinutes: 480 });
    const telegramId = settings.telegramId;

    try {
      // Period 1: 180 min.
      const first = await startWorkday(telegramId, settings);
      await backdateOpenPeriod(first.record.id, 180);
      const end1 = await endWorkday(telegramId, settings);
      assert.equal(end1.workedMinutes, 180);
      assert.equal(end1.periods.length, 1);

      // Period 2 on the same (closed) day: 60 min so far.
      const second = await startWorkday(telegramId, settings);
      assert.equal(second.record.id, first.record.id);
      assert.equal(second.periods.length, 2);
      assert.equal(second.workedMinutesSoFar, 180);
      // Expected end covers only what is still missing: 480 - 180 = 300 min.
      assert.equal(
        second.record.expectedEndTime!.getTime() - new Date(second.periods[1].startTime).getTime(),
        300 * MIN
      );
      await backdateOpenPeriod(first.record.id, 60);

      const status = await getTodayStatus(telegramId, settings);
      assert.equal(status.workedMinutesSoFar, 240);
      assert.equal(status.periods.length, 2);
      assert.equal(status.periods[1].endTime, null);

      const end2 = await endWorkday(telegramId, settings);
      assert.equal(end2.workedMinutes, 240);
      assert.equal(end2.balanceMinutes, 240 - 480);

      // Stored state: one record, two closed periods, the total on the record.
      const records = await prisma.dailyRecord.findMany({ where: { telegramId } });
      assert.equal(records.length, 1);
      const periods = await prisma.workPeriod.findMany({
        where: { dailyRecordId: records[0].id },
        orderBy: { startTime: "asc" },
      });
      assert.equal(periods.length, 2);
      assert.ok(periods.every((p) => p.endTime !== null));
      assert.equal(records[0].workedMinutes, 240);
      // The record mirrors the day's first start and last end.
      assert.equal(records[0].startTime!.getTime(), periods[0].startTime.getTime());
      assert.equal(records[0].endTime!.getTime(), periods[1].endTime!.getTime());
    } finally {
      await cleanupTestUser(telegramId);
    }
  });

  it("opens only one period when two /start requests race on a closed day", async () => {
    const settings = await createTestSettings();
    const telegramId = settings.telegramId;

    try {
      await startWorkday(telegramId, settings);
      await endWorkday(telegramId, settings);

      // Both read "no open period" before either writes; the partial unique
      // index lets only one of them commit.
      const results = await Promise.allSettled([
        startWorkday(telegramId, settings),
        startWorkday(telegramId, settings),
      ]);

      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      assert.equal((rejected.reason as { code: string }).code, "DAILY_RECORD_ALREADY_EXISTS");

      const record = await prisma.dailyRecord.findFirstOrThrow({ where: { telegramId } });
      assert.equal(record.endTime, null);
      assert.equal(await prisma.workPeriod.count({ where: { dailyRecordId: record.id } }), 2);
      assert.equal(
        await prisma.workPeriod.count({ where: { dailyRecordId: record.id, endTime: null } }),
        1
      );
    } finally {
      await cleanupTestUser(telegramId);
    }
  });

  it("creates only one record when the day's first /start is sent twice at once", async () => {
    const settings = await createTestSettings();
    const telegramId = settings.telegramId;

    try {
      const results = await Promise.allSettled([
        startWorkday(telegramId, settings),
        startWorkday(telegramId, settings),
      ]);

      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      assert.equal((rejected.reason as { code: string }).code, "DAILY_RECORD_ALREADY_EXISTS");
      assert.equal(await prisma.dailyRecord.count({ where: { telegramId } }), 1);
      assert.equal(await prisma.workPeriod.count({ where: { dailyRecord: { telegramId } } }), 1);
    } finally {
      await cleanupTestUser(telegramId);
    }
  });

  it("rejects a fifth period and leaves the day unchanged", async () => {
    const settings = await createTestSettings();
    const telegramId = settings.telegramId;

    try {
      for (let i = 0; i < 4; i++) {
        await startWorkday(telegramId, settings);
        await endWorkday(telegramId, settings);
      }

      await assert.rejects(() => startWorkday(telegramId, settings), (err: unknown) => {
        assert.equal((err as { code: string }).code, "WORK_PERIOD_LIMIT_REACHED");
        return true;
      });

      const record = await prisma.dailyRecord.findFirstOrThrow({ where: { telegramId } });
      assert.notEqual(record.endTime, null);
      assert.equal(await prisma.workPeriod.count({ where: { dailyRecordId: record.id } }), 4);
    } finally {
      await cleanupTestUser(telegramId);
    }
  });
});
