import { prisma } from "@/config/PrismaClient";
import type { DailyRecord, DailyRecordType } from "@/generated/prisma/client";

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
}

/**
 * Returns the user's open record (endTime IS NULL), regardless of workDate.
 * Used to enforce the single open record invariant.
 */
export async function findOpenRecord(
  telegramId: string
): Promise<DailyRecord | null> {
  return prisma.dailyRecord.findFirst({
    where: { telegramId, endTime: null },
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
 */
export async function upsertRecordByDate(
  input: UpsertDailyRecordInput
): Promise<DailyRecord> {
  const { telegramId, workDate, recordType, startTime, expectedEndTime, endTime, workedMinutes } =
    input;

  const payload = {
    recordType,
    startTime: startTime ?? null,
    expectedEndTime: expectedEndTime ?? null,
    endTime: endTime ?? null,
    workedMinutes: workedMinutes ?? null,
  };

  return prisma.dailyRecord.upsert({
    where: { telegramId_workDate: { telegramId, workDate } },
    update: payload,
    create: { telegramId, workDate, ...payload },
  });
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
