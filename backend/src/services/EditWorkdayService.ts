import { DateTime } from "luxon";
import { findRecordByDate, updateDailyRecord } from "@/repositories/DailyRecordRepository";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { resolveDdMmToDate, localTimeToUtc } from "@/utils/DateUtils";
import { AppError } from "@/utils/AppError";
import { calcWorkedMinutes, calcBalance } from "@/services/TimeCalculationService";
import type { DailyRecord as PrismaRecord } from "@/generated/prisma/client";
import type { DailyRecord } from "@shared/types/CoreTypes";
import type { EditDayOptions, EditWorkdayResult } from "@shared/types/ViewTypes";
import type { EditRecordState, EditAction, DailyRecordType } from "@shared/types/CoreTypes";

/** Converts a YYYY-MM-DD string to a UTC midnight Date for Prisma date column lookups. */
function localDateToUtcMidnight(dateStr: string): Date {
  return DateTime.fromISO(dateStr, { zone: "utc" }).toJSDate();
}

/** Derives the EditRecordState from the raw Prisma record. */
function resolveState(record: PrismaRecord | null): EditRecordState {
  if (record === null) return "NO_RECORD";
  if (record.recordType === "WORK") {
    return record.endTime === null ? "OPEN_WORK_RECORD" : "CLOSED_WORK_RECORD";
  }
  return "ABSENCE_RECORD";
}

const ALLOWED_ACTIONS: Record<EditRecordState, EditAction[]> = {
  OPEN_WORK_RECORD:   ["SET_END_HOUR", "SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL"],
  NO_RECORD:          ["SET_START_AND_END_HOURS", "MARK_ABSENCE"],
  CLOSED_WORK_RECORD: ["SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL"],
  ABSENCE_RECORD:     ["SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL"],
};

/** Maps a Prisma DailyRecord (Date timestamps) to the shared DailyRecord shape (ISO strings). */
function toSharedRecord(prisma: PrismaRecord, workDateStr: string): DailyRecord {
  return {
    id: prisma.id,
    telegramId: prisma.telegramId,
    workDate: workDateStr,
    recordType: prisma.recordType as DailyRecordType,
    startTime: prisma.startTime?.toISOString() ?? null,
    expectedEndTime: prisma.expectedEndTime?.toISOString() ?? null,
    endTime: prisma.endTime?.toISOString() ?? null,
    workedMinutes: prisma.workedMinutes ?? null,
    createdAt: prisma.createdAt.toISOString(),
    updatedAt: prisma.updatedAt.toISOString(),
  };
}

/**
 * Returns the editable state of a specific date for the given user.
 * `ddMm` must be a valid `dd-mm` string (validated by the route layer).
 *
 * Throws:
 * - USER_SETTINGS_NOT_FOUND – no settings found for the user.
 */
export async function getEditDayOptions(
  telegramId: string,
  ddMm: string
): Promise<EditDayOptions> {
  const settings = await getSettingsOrThrow(telegramId);
  const workDateStr = resolveDdMmToDate(ddMm, settings.timezone);
  const workDate = localDateToUtcMidnight(workDateStr);

  const record = await findRecordByDate(telegramId, workDate);
  const state = resolveState(record);

  return {
    workDate: workDateStr,
    displayDate: ddMm,
    state,
    record: record ? toSharedRecord(record, workDateStr) : null,
    allowedActions: ALLOWED_ACTIONS[state],
  };
}

/**
 * Validates that the requested action is allowed for the current state of a date.
 * Throws CONFLICT if the action is not in the allowed list.
 * Exposed so PATCH handlers can reuse the check before applying their mutation.
 */
export function assertActionAllowed(
  state: EditRecordState,
  action: EditAction
): void {
  if (!ALLOWED_ACTIONS[state].includes(action)) {
    throw new AppError(
      "CONFLICT",
      `Action "${action}" is not allowed when the date is in state "${state}".`
    );
  }
}

/** Builds an EditWorkdayResult from a saved Prisma record and derived fields. */
function toEditWorkdayResult(
  prisma: PrismaRecord,
  workDateStr: string,
  ddMm: string,
  requiredMinutes: number
): EditWorkdayResult {
  const workedMinutes = prisma.workedMinutes ?? 0;
  return {
    id: prisma.id,
    telegramId: prisma.telegramId,
    workDate: workDateStr,
    displayDate: ddMm,
    recordType: prisma.recordType as DailyRecordType,
    startTime: prisma.startTime?.toISOString() ?? null,
    expectedEndTime: prisma.expectedEndTime?.toISOString() ?? null,
    endTime: prisma.endTime?.toISOString() ?? null,
    workedMinutes,
    requiredMinutes,
    balanceMinutes: calcBalance(workedMinutes, requiredMinutes),
  };
}

// ── Action: SET_END_HOUR ──────────────────────────────────────────────────────

/**
 * Closes an open WORK record by applying the given HH:mm end time to the
 * edited date in the user's timezone. The existing startTime is preserved.
 *
 * Throws CONFLICT when the date is not in OPEN_WORK_RECORD state.
 */
export async function setEndHour(
  telegramId: string,
  ddMm: string,
  endTimeHhMm: string
): Promise<EditWorkdayResult> {
  const settings = await getSettingsOrThrow(telegramId);
  const workDateStr = resolveDdMmToDate(ddMm, settings.timezone);
  const workDate = localDateToUtcMidnight(workDateStr);

  const record = await findRecordByDate(telegramId, workDate);
  assertActionAllowed(resolveState(record), "SET_END_HOUR");

  // record is guaranteed non-null and OPEN_WORK_RECORD at this point
  if (!record!.startTime) {
    throw new AppError("CONFLICT", "Open record is missing start time.");
  }

  const endTimeUtc = localTimeToUtc(workDateStr, endTimeHhMm, settings.timezone);
  const workedMinutes = calcWorkedMinutes(record!.startTime, endTimeUtc);

  const updated = await updateDailyRecord(record!.id, { endTime: endTimeUtc, workedMinutes });

  return toEditWorkdayResult(updated, workDateStr, ddMm, settings.dailyRequiredMinutes);
}
