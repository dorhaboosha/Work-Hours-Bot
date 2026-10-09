/**
 * Integration tests for editing a date's work periods through /edit, run
 * against a real Postgres (see backend/src/test-helpers/integrationDb.ts).
 *
 * The unit tests mock the repositories, so they can't prove the stored
 * periods and the record's first start / last end / worked total actually
 * stay in step across a chain of edits. These tests check the stored rows
 * after each step.
 *
 * Run with: npm run test:integration (requires the docker-compose Postgres).
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  addWorkPeriod,
  editWorkPeriod,
  markAbsence,
  removeWorkPeriod,
  setStartAndEndHours,
} from "@/services/EditWorkdayService";
import { prisma } from "@/config/PrismaClient";
import {
  createTestSettings,
  cleanupTestUser,
  assertSafeTestDatabase,
} from "@/test-helpers/integrationDb";

/** Any valid dd-mm — the exact calendar date doesn't matter for these assertions. */
const DATE = "16-06";

/** The stored record and its periods as local "HH:mm-HH:mm" strings (settings use UTC). */
async function storedDay(telegramId: string) {
  const record = await prisma.dailyRecord.findFirst({ where: { telegramId } });
  if (!record) return null;
  const periods = await prisma.workPeriod.findMany({
    where: { dailyRecordId: record.id },
    orderBy: { startTime: "asc" },
  });
  const hhmm = (d: Date | null) => d?.toISOString().slice(11, 16) ?? "open";
  return {
    record,
    ranges: periods.map((p) => `${hhmm(p.startTime)}-${hhmm(p.endTime)}`),
    firstStart: hhmm(record.startTime),
    lastEnd: hhmm(record.endTime),
  };
}

describe("Work periods — /edit actions (integration)", () => {
  before(assertSafeTestDatabase);

  it("keeps the stored periods and the record's summary in step across add, edit and delete", async () => {
    const settings = await createTestSettings({ dailyRequiredMinutes: 480 });
    const telegramId = settings.telegramId;

    try {
      // Period 1 via "Set start and end hours".
      await setStartAndEndHours(telegramId, DATE, "09:00", "12:00");

      // Add the afternoon, then one before the morning.
      await addWorkPeriod(telegramId, DATE, "13:00", "17:00");
      await addWorkPeriod(telegramId, DATE, "07:00", "08:00");
      let day = await storedDay(telegramId);
      assert.deepEqual(day!.ranges, ["07:00-08:00", "09:00-12:00", "13:00-17:00"]);
      assert.equal(day!.firstStart, "07:00");
      assert.equal(day!.lastEnd, "17:00");
      assert.equal(day!.record.workedMinutes, 60 + 180 + 240);

      // An overlapping add is rejected and changes nothing.
      await assert.rejects(() => addWorkPeriod(telegramId, DATE, "11:00", "14:00"));
      assert.deepEqual((await storedDay(telegramId))!.ranges, day!.ranges);

      // Stretch period 3 to 18:00.
      await editWorkPeriod(telegramId, DATE, 3, "13:00", "18:00");
      day = await storedDay(telegramId);
      assert.equal(day!.lastEnd, "18:00");
      assert.equal(day!.record.workedMinutes, 60 + 180 + 300);

      // Delete the early period — the first start moves to 09:00.
      await removeWorkPeriod(telegramId, DATE, 1);
      day = await storedDay(telegramId);
      assert.deepEqual(day!.ranges, ["09:00-12:00", "13:00-18:00"]);
      assert.equal(day!.firstStart, "09:00");
      assert.equal(day!.record.workedMinutes, 180 + 300);

      // "Set the whole day as one period" replaces both.
      await setStartAndEndHours(telegramId, DATE, "08:00", "16:30");
      day = await storedDay(telegramId);
      assert.deepEqual(day!.ranges, ["08:00-16:30"]);
      assert.equal(day!.record.workedMinutes, 510);

      // Deleting the last period of a work day removes the record (and its periods).
      assert.equal(await removeWorkPeriod(telegramId, DATE, 1), null);
      assert.equal(await storedDay(telegramId), null);
      assert.equal(
        await prisma.workPeriod.count({ where: { dailyRecord: { telegramId } } }),
        0
      );
    } finally {
      await cleanupTestUser(telegramId);
    }
  });

  it("drops the periods for a full-day absence and keeps them for a half day", async () => {
    const settings = await createTestSettings({ dailyRequiredMinutes: 480, vacationBalance: 10 });
    const telegramId = settings.telegramId;

    try {
      await setStartAndEndHours(telegramId, DATE, "09:00", "12:00");
      await addWorkPeriod(telegramId, DATE, "13:00", "15:00");

      // Half vacation keeps both periods and their total.
      await markAbsence(telegramId, DATE, "VACATION", "HALF");
      let day = await storedDay(telegramId);
      assert.equal(day!.record.recordType, "VACATION");
      assert.deepEqual(day!.ranges, ["09:00-12:00", "13:00-15:00"]);
      assert.equal(day!.record.workedMinutes, 300);

      // A full holiday clears the hours and the periods.
      await markAbsence(telegramId, DATE, "HOLIDAY");
      day = await storedDay(telegramId);
      assert.equal(day!.record.recordType, "HOLIDAY");
      assert.deepEqual(day!.ranges, []);
      assert.equal(day!.record.startTime, null);
      assert.equal(day!.record.workedMinutes, 0);
    } finally {
      await cleanupTestUser(telegramId);
    }
  });
});
