import { DateTime } from "luxon";
import { findRecordByDate, updateDailyRecord, upsertRecordByDate } from "@/repositories/DailyRecordRepository";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { resolveDdMmToDate, localTimeToUtc } from "@/utils/DateUtils";
import { AppError } from "@/utils/AppError";
import { calcExpectedEndTime, calcWorkedMinutes, calcBalance } from "@/services/TimeCalculationService";
import type { DailyRecord as PrismaRecord } from "@/generated/prisma/client";
import type { DailyRecord } from "@shared/types/CoreTypes";
import type { EditDayOptions, EditWorkdayResult } from "@shared/types/ViewTypes";
import type { EditRecordState, EditAction, DailyRecordType, AbsenceRecordType } from "@shared/types/CoreTypes";
import { calculateCreditedMinutes } from "@shared/utils/recordTypeUtils";

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

// ── Action: SET_START_AND_END_HOURS ───────────────────────────────────────────

/**
 * Creates or replaces the record for the edited date as a closed WORK record
 * with the given start and end times (applied to the edited date, not today).
 * `expectedEndTime` is calculated as startTime + dailyRequiredMinutes.
 *
 * Allowed in all states (NO_RECORD, OPEN_WORK_RECORD, CLOSED_WORK_RECORD, ABSENCE_RECORD).
 */
export async function setStartAndEndHours(
  telegramId: string,
  ddMm: string,
  startTimeHhMm: string,
  endTimeHhMm: string
): Promise<EditWorkdayResult> {
  const settings = await getSettingsOrThrow(telegramId);
  const workDateStr = resolveDdMmToDate(ddMm, settings.timezone);
  const workDate = localDateToUtcMidnight(workDateStr);

  const record = await findRecordByDate(telegramId, workDate);
  assertActionAllowed(resolveState(record), "SET_START_AND_END_HOURS");

  const startTimeUtc = localTimeToUtc(workDateStr, startTimeHhMm, settings.timezone);
  const endTimeUtc   = localTimeToUtc(workDateStr, endTimeHhMm,   settings.timezone);
  const expectedEndTimeUtc = calcExpectedEndTime(startTimeUtc, settings.dailyRequiredMinutes);
  const workedMinutes = calcWorkedMinutes(startTimeUtc, endTimeUtc);

  const saved = await upsertRecordByDate({
    telegramId,
    workDate,
    recordType: "WORK",
    startTime: startTimeUtc,
    expectedEndTime: expectedEndTimeUtc,
    endTime: endTimeUtc,
    workedMinutes,
  });

  return toEditWorkdayResult(saved, workDateStr, ddMm, settings.dailyRequiredMinutes);
}

// ── Action: MARK_ABSENCE ──────────────────────────────────────────────────────

/**
 * Creates or replaces the record for the edited date as an absence record.
 * All timestamps (startTime, expectedEndTime, endTime) are set to null.
 * workedMinutes is set by the absence credit rule:
 *   - SICK / VACATION / HOLIDAY / ELECTION → dailyRequiredMinutes
 *   - HOLIDAY_EVE                           → floor(dailyRequiredMinutes / 2)
 *   - UNPAID_ABSENCE                        → 0
 *
 * Allowed in all states (NO_RECORD, OPEN_WORK_RECORD, CLOSED_WORK_RECORD, ABSENCE_RECORD).
 */
export async function markAbsence(
  telegramId: string,
  ddMm: string,
  absenceType: AbsenceRecordType
): Promise<EditWorkdayResult> {
  const settings = await getSettingsOrThrow(telegramId);
  const workDateStr = resolveDdMmToDate(ddMm, settings.timezone);
  const workDate = localDateToUtcMidnight(workDateStr);

  const record = await findRecordByDate(telegramId, workDate);
  assertActionAllowed(resolveState(record), "MARK_ABSENCE");

  const workedMinutes = calculateCreditedMinutes(absenceType, settings.dailyRequiredMinutes);

  const saved = await upsertRecordByDate({
    telegramId,
    workDate,
    recordType: absenceType,
    startTime: null,
    expectedEndTime: null,
    endTime: null,
    workedMinutes,
  });

  return toEditWorkdayResult(saved, workDateStr, ddMm, settings.dailyRequiredMinutes);
}
