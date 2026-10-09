import { prisma } from "@/config/PrismaClient";
import type { PrismaClientOrTx } from "@/config/PrismaClient";
import type { WorkPeriod } from "@/generated/prisma/client";

export interface CreateWorkPeriodInput {
  dailyRecordId: string;
  startTime: Date;
  /** omitted/null = the period is still open */
  endTime?: Date | null;
}

/** Flexible update: only supplied fields are written; omitted fields are untouched. */
export interface UpdateWorkPeriodInput {
  startTime?: Date;
  endTime?: Date | null;
}

/** Returns a day's work periods in start order. */
export async function listWorkPeriods(
  dailyRecordId: string,
  client: PrismaClientOrTx = prisma
): Promise<WorkPeriod[]> {
  return client.workPeriod.findMany({
    where: { dailyRecordId },
    orderBy: { startTime: "asc" },
  });
}

export async function createWorkPeriod(
  input: CreateWorkPeriodInput,
  client: PrismaClientOrTx = prisma
): Promise<WorkPeriod> {
  const { dailyRecordId, startTime, endTime } = input;
  return client.workPeriod.create({
    data: { dailyRecordId, startTime, endTime: endTime ?? null },
  });
}

export async function updateWorkPeriod(
  id: string,
  input: UpdateWorkPeriodInput,
  client: PrismaClientOrTx = prisma
): Promise<WorkPeriod> {
  return client.workPeriod.update({
    where: { id },
    data: input,
  });
}

export async function deleteWorkPeriod(
  id: string,
  client: PrismaClientOrTx = prisma
): Promise<void> {
  await client.workPeriod.delete({ where: { id } });
}

/** Deletes every period of a day (e.g. before replacing them, or when its hours are cleared). */
export async function deleteWorkPeriodsOfRecord(
  dailyRecordId: string,
  client: PrismaClientOrTx = prisma
): Promise<void> {
  await client.workPeriod.deleteMany({ where: { dailyRecordId } });
}
