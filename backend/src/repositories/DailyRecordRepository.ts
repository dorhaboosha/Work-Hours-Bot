import { prisma } from "@/config/PrismaClient";
import type { PrismaClientOrTx } from "@/config/PrismaClient";
import type { DailyRecord, DailyRecordType } from "@/generated/prisma/client";
import type { LeaveBalanceField } from "@/repositories/UserSettingsRepository";

export interface CreateDailyRecordInput {
  telegramId: string;
  workDate: Date;
  recordType?: DailyRecordType;
  startTime?: Date | null;
  expectedEndTime?: Date | null;
  workedMinutes?: number | null;
}

/** Flexible update: only supplied fields are written; omitted fields are untouched. */
export interface UpdateDailyRecordInput {
  recordType?: DailyRecordType;
  startTime?: Date | null;
  expectedEndTime?: Date | null;
  endTime?: Date | null;
  workedMinutes?: number | null;
}

/** Full upsert payload for create-or-replace on a specific date (edit flow). */
export interface UpsertDailyRecordInput {
  telegramId: string;
  workDate: Date;
  recordType: DailyRecordType;
  startTime?: Date | null;
  expectedEndTime?: Date | null;
  endTime?: Date | null;
  workedMinutes?: number | null;
  /** Which leave balance (if any) this record currently debits — used to refund it correctly on a later edit. */
  debitedLeaveField?: LeaveBalanceField | null;
  debitedLeaveDays?: number | null;
}

/**
 * Returns the user's open WORK record (recordType=WORK, endTime IS NULL).
 * Absence records always have endTime=null too, so this filter is required
 * to enforce the single open WORK record invariant correctly.
 */
export async function findOpenWorkRecord(
  telegramId: string
): Promise<DailyRecord | null> {
  return prisma.dailyRecord.findFirst({
    where: { telegramId, recordType: "WORK", endTime: null },
    orderBy: { workDate: "desc" },
  });
}

/** Looks up a record by its exact workDate (as a UTC midnight Date). */
export async function findRecordByDate(
  telegramId: string,
  workDate: Date
): Promise<DailyRecord | null> {
  return prisma.dailyRecord.findUnique({
    where: { telegramId_workDate: { telegramId, workDate } },
  });
}

export async function createDailyRecord(
  input: CreateDailyRecordInput
): Promise<DailyRecord> {
  const { telegramId, workDate, recordType, startTime, expectedEndTime, workedMinutes } = input;
  return prisma.dailyRecord.create({
    data: {
      telegramId,
      workDate,
      ...(recordType !== undefined && { recordType }),
      startTime: startTime ?? null,
      expectedEndTime: expectedEndTime ?? null,
      ...(workedMinutes !== undefined && { workedMinutes }),
    },
  });
}

export async function updateDailyRecord(
  id: string,
  input: UpdateDailyRecordInput
): Promise<DailyRecord> {
  return prisma.dailyRecord.update({
    where: { id },
    data: input,
  });
}

/**
 * Creates or replaces the record for a specific (telegramId, workDate).
 * Used by the edit-day flow (SET_START_AND_END_HOURS, MARK_ABSENCE).
 *
 * Accepts an optional transaction client so callers that need this write to
 * be atomic with another write (e.g. a leave-balance debit) can pass the `tx`
 * from prisma.$transaction() instead of the default standalone client.
 *
 * Every current caller always sets debitedLeaveField/debitedLeaveDays as a
 * matched pair (both null, or both set) — enforced here so a future caller
 * can't silently write a mismatched pair, which would break the refund logic
 * in EditWorkdayService (it reads this pair to decide whether/how much to
 * refund on a later edit).
 */
export async function upsertRecordByDate(
  input: UpsertDailyRecordInput,
  client: PrismaClientOrTx = prisma
): Promise<DailyRecord> {
  const {
    telegramId,
    workDate,
    recordType,
    startTime,
    expectedEndTime,
    endTime,
    workedMinutes,
    debitedLeaveField,
    debitedLeaveDays,
  } = input;

  const hasField = debitedLeaveField !== undefined && debitedLeaveField !== null;
  const hasDays = debitedLeaveDays !== undefined && debitedLeaveDays !== null;
  if (hasField !== hasDays) {
    throw new Error(
      "upsertRecordByDate: debitedLeaveField and debitedLeaveDays must be provided together (both set or both null/omitted)."
    );
  }

  const payload = {
    recordType,
    startTime: startTime ?? null,
    expectedEndTime: expectedEndTime ?? null,
    endTime: endTime ?? null,
    workedMinutes: workedMinutes ?? null,
    debitedLeaveField: debitedLeaveField ?? null,
    debitedLeaveDays: debitedLeaveDays ?? null,
  };

  return client.dailyRecord.upsert({
    where: { telegramId_workDate: { telegramId, workDate } },
    update: payload,
    create: { telegramId, workDate, ...payload },
  });
}

/**
 * Deletes every daily_records row (any recordType, any user) whose workDate
 * is strictly before `cutoff`. Returns the number of rows deleted.
 * Used by the monthly retention purge — a single bulk deleteMany, no per-user loop.
 */
export async function deleteDailyRecordsBefore(cutoff: Date): Promise<number> {
  const result = await prisma.dailyRecord.deleteMany({
    where: { workDate: { lt: cutoff } },
  });
  return result.count;
}

/**
 * Lists all records for a user, optionally filtered to a date window.
 * `from` and `to` are UTC midnight Dates representing local workDates.
 */
export async function listRecordsByRange(
  telegramId: string,
  from?: Date,
  to?: Date
): Promise<DailyRecord[]> {
  return prisma.dailyRecord.findMany({
    where: {
      telegramId,
      ...(from !== undefined || to !== undefined
        ? {
            workDate: {
              ...(from !== undefined && { gte: from }),
              ...(to !== undefined && { lte: to }),
            },
          }
        : {}),
    },
    orderBy: { workDate: "asc" },
  });
}
