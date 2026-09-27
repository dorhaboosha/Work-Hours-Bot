import { prisma } from "@/config/PrismaClient";
import { findRecordByDate, updateDailyRecord, upsertRecordByDate } from "@/repositories/DailyRecordRepository";
import { decrementLeaveBalance, creditLeaveBalance } from "@/repositories/UserSettingsRepository";
import type { LeaveBalanceField } from "@/repositories/UserSettingsRepository";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { applyPendingLeaveAccrual } from "@/services/LeaveBalanceService";
import { resolveDdMmToDate, localTimeToUtc, localDateToUtcMidnight } from "@/utils/DateUtils";
import { AppError } from "@/utils/AppError";
import { calcExpectedEndTime, calcWorkedMinutes, calcBalance } from "@/services/TimeCalculationService";
import type { DailyRecord as PrismaRecord, UserSettings } from "@/generated/prisma/client";
import type { DailyRecord } from "@shared/types/CoreTypes";
import type { EditDayOptions, EditWorkdayResult } from "@shared/types/ViewTypes";
import type { EditRecordState, EditAction, DailyRecordType, AbsenceRecordType, AbsencePortion } from "@shared/types/CoreTypes";
import { requiresPortionChoice, resolveAbsenceTerms } from "@shared/utils/recordTypeUtils";

/** Derives the EditRecordState from the raw Prisma record. */
function resolveState(record: PrismaRecord | null): EditRecordState {
  if (record === null) return "NO_RECORD";
  if (record.absencePortion === "HALF") {
    return record.startTime !== null && record.endTime === null
      ? "HALF_DAY_OPEN_RECORD"
      : "HALF_DAY_RECORD";
  }
  if (record.recordType === "WORK") {
    return record.endTime === null ? "OPEN_WORK_RECORD" : "CLOSED_WORK_RECORD";
  }
  return "ABSENCE_RECORD";
}

// On a half day, SET_START_AND_END_HOURS replaces the absence with a regular
// work day (refunding its debit); LOG_HOURS sets the hours and keeps it.
const ALLOWED_ACTIONS: Record<EditRecordState, EditAction[]> = {
  OPEN_WORK_RECORD:     ["SET_END_HOUR", "SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL"],
  NO_RECORD:            ["SET_START_AND_END_HOURS", "MARK_ABSENCE"],
  CLOSED_WORK_RECORD:   ["SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL"],
  ABSENCE_RECORD:       ["SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL"],
  HALF_DAY_RECORD:      ["LOG_HOURS", "SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL"],
  HALF_DAY_OPEN_RECORD: ["SET_END_HOUR", "LOG_HOURS", "SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL"],
};

/** Maps a Prisma DailyRecord (Date timestamps) to the shared DailyRecord shape (ISO strings). */
function toSharedRecord(prisma: PrismaRecord, workDateStr: string): DailyRecord {
  return {
    id: prisma.id,
    telegramId: prisma.telegramId,
    workDate: workDateStr,
    recordType: prisma.recordType as DailyRecordType,
    absencePortion: prisma.absencePortion,
    startTime: prisma.startTime?.toISOString() ?? null,
    expectedEndTime: prisma.expectedEndTime?.toISOString() ?? null,
    endTime: prisma.endTime?.toISOString() ?? null,
    workedMinutes: prisma.workedMinutes ?? null,
    creditedMinutes: prisma.creditedMinutes,
    debitedLeaveField: prisma.debitedLeaveField as "vacationBalance" | "sickBalance" | null,
    debitedLeaveDays: prisma.debitedLeaveDays ?? null,
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
  const creditedMinutes = prisma.creditedMinutes;
  return {
    id: prisma.id,
    telegramId: prisma.telegramId,
    workDate: workDateStr,
    displayDate: ddMm,
    recordType: prisma.recordType as DailyRecordType,
    absencePortion: prisma.absencePortion,
    startTime: prisma.startTime?.toISOString() ?? null,
    expectedEndTime: prisma.expectedEndTime?.toISOString() ?? null,
    endTime: prisma.endTime?.toISOString() ?? null,
    workedMinutes,
    creditedMinutes,
    requiredMinutes,
    balanceMinutes: calcBalance(workedMinutes + creditedMinutes, requiredMinutes),
  };
}

/** Strict HH:mm (00:00–23:59). Matches EditWorkdaySchemas hhmmSchema. */
const HH_MM_STRICT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Throws INVALID_TIME_FORMAT unless both values are strict HH:mm. */
function assertStartEndFormat(startTimeHhMm: string, endTimeHhMm: string): void {
  if (!HH_MM_STRICT_RE.test(startTimeHhMm)) {
    throw new AppError(
      "INVALID_TIME_FORMAT",
      'startTime must be in HH:mm format (e.g. "09:00")'
    );
  }
  if (!HH_MM_STRICT_RE.test(endTimeHhMm)) {
    throw new AppError(
      "INVALID_TIME_FORMAT",
      'endTime must be in HH:mm format (e.g. "17:30")'
    );
  }
}

/**
 * Applies HH:mm start/end times to the edited date in the user's timezone.
 * Throws INVALID_TIME_RANGE unless end is after start.
 */
function toUtcTimeRange(
  workDateStr: string,
  startTimeHhMm: string,
  endTimeHhMm: string,
  timezone: string
): { startTimeUtc: Date; endTimeUtc: Date } {
  const startTimeUtc = localTimeToUtc(workDateStr, startTimeHhMm, timezone);
  const endTimeUtc   = localTimeToUtc(workDateStr, endTimeHhMm,   timezone);

  if (endTimeUtc.getTime() <= startTimeUtc.getTime()) {
    throw new AppError(
      "INVALID_TIME_RANGE",
      "endTime must be after startTime"
    );
  }
  return { startTimeUtc, endTimeUtc };
}

/** Expected end of a session: start + whatever the absence credit doesn't cover. */
function calcSessionExpectedEnd(
  startTime: Date,
  dailyRequiredMinutes: number,
  creditedMinutes: number
): Date {
  return calcExpectedEndTime(startTime, Math.max(0, dailyRequiredMinutes - creditedMinutes));
}

// ── Action: SET_END_HOUR ──────────────────────────────────────────────────────

/**
 * Closes an open work session (a WORK record, or a half-day absence with a
 * session started) by applying the given HH:mm end time to the edited date in
 * the user's timezone. The existing startTime (and any absence) is preserved.
 *
 * Throws CONFLICT when the date has no open session.
 */
export async function setEndHour(
  telegramId: string,
  ddMm: string,
  endTimeHhMm: string
): Promise<EditWorkdayResult> {
  if (!HH_MM_STRICT_RE.test(endTimeHhMm)) {
    throw new AppError(
      "INVALID_TIME_FORMAT",
      'Time must be in HH:mm format (e.g. "17:30")'
    );
  }

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
  if (endTimeUtc.getTime() <= record!.startTime.getTime()) {
    throw new AppError(
      "INVALID_TIME_RANGE",
      "endTime must be after startTime"
    );
  }

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
 *
 * If the date being overwritten previously debited a leave balance (e.g. it
 * was VACATION and is now being converted to worked hours), that amount is
 * refunded atomically with the upsert — see markAbsence() for the same
 * refund-then-(re)debit pattern applied to absence-to-absence changes.
 */
export async function setStartAndEndHours(
  telegramId: string,
  ddMm: string,
  startTimeHhMm: string,
  endTimeHhMm: string
): Promise<EditWorkdayResult> {
  assertStartEndFormat(startTimeHhMm, endTimeHhMm);

  // Catch up any owed leave accrual first — this may now refund a balance.
  const settings = await applyPendingLeaveAccrual(telegramId);
  const workDateStr = resolveDdMmToDate(ddMm, settings.timezone);
  const workDate = localDateToUtcMidnight(workDateStr);

  const existingRecord = await findRecordByDate(telegramId, workDate);
  assertActionAllowed(resolveState(existingRecord), "SET_START_AND_END_HOURS");

  const { startTimeUtc, endTimeUtc } = toUtcTimeRange(
    workDateStr,
    startTimeHhMm,
    endTimeHhMm,
    settings.timezone
  );
  const expectedEndTimeUtc = calcExpectedEndTime(startTimeUtc, settings.dailyRequiredMinutes);
  const workedMinutes = calcWorkedMinutes(startTimeUtc, endTimeUtc);

  const previousField = (existingRecord?.debitedLeaveField ?? null) as LeaveBalanceField | null;
  const previousDays = existingRecord?.debitedLeaveDays ?? null;
  const hasPreviousDebit = previousField !== null && previousDays !== null && previousDays > 0;

  const upsertInput = {
    telegramId,
    workDate,
    recordType: "WORK" as const,
    absencePortion: null,
    startTime: startTimeUtc,
    expectedEndTime: expectedEndTimeUtc,
    endTime: endTimeUtc,
    workedMinutes,
    // A WORK record never carries a credit or a debit — clears whatever the overwritten record had.
    creditedMinutes: 0,
    debitedLeaveField: null,
    debitedLeaveDays: null,
  };

  let saved: PrismaRecord;
  let leaveRefund: EditWorkdayResult["leaveRefund"] = null;

  if (hasPreviousDebit) {
    const result = await prisma.$transaction(async (tx) => {
      const record = await upsertRecordByDate(upsertInput, tx);
      const refundedSettings = await creditLeaveBalance(
        telegramId,
        previousField as LeaveBalanceField,
        previousDays as number,
        tx
      );
      return { record, refundedSettings };
    });

    saved = result.record;
    leaveRefund = {
      field: previousField as LeaveBalanceField,
      amount: previousDays as number,
      newBalance: result.refundedSettings[previousField as LeaveBalanceField],
    };
  } else {
    saved = await upsertRecordByDate(upsertInput);
  }

  return {
    ...toEditWorkdayResult(saved, workDateStr, ddMm, settings.dailyRequiredMinutes),
    leaveRefund,
  };
}

// ── Action: LOG_HOURS ─────────────────────────────────────────────────────────

/**
 * Sets the worked hours on a half-day absence (e.g. the worked half of a
 * ½ vacation day or a holiday eve), replacing any hours already logged.
 * The absence, its credit and its leave debit are kept untouched.
 * expectedEndTime is start + (dailyRequiredMinutes − creditedMinutes).
 *
 * Throws:
 * - INVALID_TIME_FORMAT / INVALID_TIME_RANGE – bad times.
 * - CONFLICT – the date is not a half-day absence.
 */
export async function setHoursOnHalfDay(
  telegramId: string,
  ddMm: string,
  startTimeHhMm: string,
  endTimeHhMm: string
): Promise<EditWorkdayResult> {
  assertStartEndFormat(startTimeHhMm, endTimeHhMm);

  const settings = await getSettingsOrThrow(telegramId);
  const workDateStr = resolveDdMmToDate(ddMm, settings.timezone);
  const workDate = localDateToUtcMidnight(workDateStr);

  const record = await findRecordByDate(telegramId, workDate);
  assertActionAllowed(resolveState(record), "LOG_HOURS");

  const { startTimeUtc, endTimeUtc } = toUtcTimeRange(
    workDateStr,
    startTimeHhMm,
    endTimeHhMm,
    settings.timezone
  );

  // record is guaranteed non-null and a half-day absence at this point
  const updated = await updateDailyRecord(record!.id, {
    startTime: startTimeUtc,
    expectedEndTime: calcSessionExpectedEnd(
      startTimeUtc,
      settings.dailyRequiredMinutes,
      record!.creditedMinutes
    ),
    endTime: endTimeUtc,
    workedMinutes: calcWorkedMinutes(startTimeUtc, endTimeUtc),
  });

  return toEditWorkdayResult(updated, workDateStr, ddMm, settings.dailyRequiredMinutes);
}

// ── Action: MARK_ABSENCE ──────────────────────────────────────────────────────

/**
 * Creates or replaces the record for the edited date as an absence record.
 * What the absence credits and debits comes from
 * resolveAbsenceTerms (the single source of truth for the rules):
 *   - creditedMinutes: full or half of dailyRequiredMinutes (0 for UNPAID_ABSENCE)
 *   - debit: VACATION/SICK debit 1 or 0.5 day of their balance; HOLIDAY_EVE
 *     FULL debits 0.5 vacation; other types debit nothing.
 *
 * Logged hours: when the new absence is a half day (allowsWorkHours) and the
 * date already has hours (e.g. a work day being re-marked as ½ vacation, or
 * one half-day type changed to another), the hours are kept and
 * expectedEndTime is recomputed for the new credit. Otherwise all timestamps
 * are set to null and workedMinutes to 0.
 *
 * `portion` is required for VACATION and SICK (see requiresPortionChoice).
 * For other types it's optional: HOLIDAY_EVE defaults to HALF (the company-
 * paid half only), and HOLIDAY/ELECTION/UNPAID_ABSENCE are always FULL.
 * Negative balances are always allowed — debiting is never blocked.
 *
 * Allowed in all states (NO_RECORD, OPEN_WORK_RECORD, CLOSED_WORK_RECORD, ABSENCE_RECORD).
 *
 * Throws VALIDATION_ERROR if portion is missing for VACATION/SICK. Validated
 * before any write, so an invalid call never leaves a saved record without
 * its matching balance change.
 *
 * If the date being overwritten already had a debit recorded (from a
 * previous MARK_ABSENCE — different type, different portion, or the same
 * type marked again), that amount is refunded first, atomically with the
 * new debit (if any) and the record upsert — so re-marking a date never
 * stacks debits across multiple balances or amounts for a single day.
 */
export async function markAbsence(
  telegramId: string,
  ddMm: string,
  absenceType: AbsenceRecordType,
  portion?: AbsencePortion
): Promise<EditWorkdayResult> {
  if (portion === undefined && requiresPortionChoice(absenceType)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `portion (FULL or HALF) is required for ${absenceType}.`
    );
  }

  // Catch up any owed leave accrual before debiting, so the balance reflects
  // accrual through today (this codebase has no scheduler — see accrualUtils).
  const settings = await applyPendingLeaveAccrual(telegramId);
  const workDateStr = resolveDdMmToDate(ddMm, settings.timezone);
  const workDate = localDateToUtcMidnight(workDateStr);

  const terms = resolveAbsenceTerms(
    absenceType,
    portion ?? (absenceType === "HOLIDAY_EVE" ? "HALF" : "FULL"),
    settings.dailyRequiredMinutes
  );
  const balanceField = terms.debitField;
  const debitDays = terms.debitDays;

  const existingRecord = await findRecordByDate(telegramId, workDate);
  assertActionAllowed(resolveState(existingRecord), "MARK_ABSENCE");

  const previousField = (existingRecord?.debitedLeaveField ?? null) as LeaveBalanceField | null;
  const previousDays = existingRecord?.debitedLeaveDays ?? null;
  const hasPreviousDebit = previousField !== null && previousDays !== null && previousDays > 0;

  const keptStartTime = terms.allowsWorkHours ? existingRecord?.startTime ?? null : null;
  const keepHours = keptStartTime !== null;

  const upsertInput = {
    telegramId,
    workDate,
    recordType: absenceType,
    absencePortion: terms.portion,
    startTime: keptStartTime,
    expectedEndTime: keepHours
      ? calcSessionExpectedEnd(keptStartTime, settings.dailyRequiredMinutes, terms.creditedMinutes)
      : null,
    endTime: keepHours ? existingRecord!.endTime : null,
    // null while a kept session is still open, like any open session.
    workedMinutes: keepHours ? existingRecord!.workedMinutes : 0,
    creditedMinutes: terms.creditedMinutes,
    debitedLeaveField: balanceField,
    debitedLeaveDays: debitDays,
  };

  let saved: PrismaRecord;
  let leaveDebit: EditWorkdayResult["leaveDebit"] = null;
  let leaveRefund: EditWorkdayResult["leaveRefund"] = null;

  if (balanceField !== null || hasPreviousDebit) {
    // The record upsert and any refund/debit must succeed or fail together —
    // otherwise a mid-write failure could leave a saved record with no
    // matching balance change (or an incorrect one).
    const result = await prisma.$transaction(async (tx) => {
      const record = await upsertRecordByDate(upsertInput, tx);

      let refundedSettings: UserSettings | null = null;
      if (hasPreviousDebit) {
        refundedSettings = await creditLeaveBalance(
          telegramId,
          previousField as LeaveBalanceField,
          previousDays as number,
          tx
        );
      }

      let debitedSettings: UserSettings | null = null;
      if (balanceField !== null) {
        debitedSettings = await decrementLeaveBalance(
          telegramId,
          balanceField,
          debitDays as number,
          tx
        );
      }

      return { record, refundedSettings, debitedSettings };
    });

    saved = result.record;
    // Whichever ran last reflects both operations (each update returns the
    // full row), so it's the authoritative final balance for both fields.
    const finalSettings = result.debitedSettings ?? result.refundedSettings;

    if (result.refundedSettings) {
      leaveRefund = {
        field: previousField as LeaveBalanceField,
        amount: previousDays as number,
        newBalance: finalSettings![previousField as LeaveBalanceField],
      };
    }
    if (result.debitedSettings) {
      leaveDebit = {
        field: balanceField as LeaveBalanceField,
        amount: debitDays as number,
        newBalance: finalSettings![balanceField as LeaveBalanceField],
      };
    }
  } else {
    saved = await upsertRecordByDate(upsertInput);
  }

  return {
    ...toEditWorkdayResult(saved, workDateStr, ddMm, settings.dailyRequiredMinutes),
    leaveDebit,
    leaveRefund,
  };
}
