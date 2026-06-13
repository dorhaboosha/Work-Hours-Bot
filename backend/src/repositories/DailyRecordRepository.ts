import { prisma } from "@/config/PrismaClient";
import type { DailyRecord } from "@/generated/prisma/client";

export interface CreateDailyRecordInput {
  telegramId: string;
  workDate: Date;
  startTime: Date;
  expectedEndTime: Date;
}

export interface UpdateDailyRecordInput {
  endTime: Date;
  workedMinutes: number;
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
  const { telegramId, workDate, startTime, expectedEndTime } = input;
  return prisma.dailyRecord.create({
    data: { telegramId, workDate, startTime, expectedEndTime },
  });
}

export async function updateDailyRecord(
  id: string,
  input: UpdateDailyRecordInput
): Promise<DailyRecord> {
  return prisma.dailyRecord.update({
    where: { id },
    data: { endTime: input.endTime, workedMinutes: input.workedMinutes },
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
