import { prisma } from "@/config/PrismaClient";
import {
  deleteDailyRecord,
  findRecordByDate,
  updateDailyRecord,
  upsertRecordByDate,
} from "@/repositories/DailyRecordRepository";
import {
  createWorkPeriod,
  deleteWorkPeriod,
  deleteWorkPeriodsOfRecord,
  listWorkPeriods,
  updateWorkPeriod,
} from "@/repositories/WorkPeriodRepository";
import { decrementLeaveBalance, creditLeaveBalance } from "@/repositories/UserSettingsRepository";
import type { LeaveBalanceField } from "@/repositories/UserSettingsRepository";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { applyPendingLeaveAccrual } from "@/services/LeaveBalanceService";
import {
  resolveDdMmToDate,
  localTimeToUtc,
  localDateToUtcMidnight,
  utcToLocalTime,
} from "@/utils/DateUtils";
import { AppError } from "@/utils/AppError";
import {
  calcExpectedEndTime,
  calcWorkedMinutes,
  calcPeriodsWorkedMinutes,
  calcBalance,
} from "@/services/TimeCalculationService";
import type {
  DailyRecord as PrismaRecord,
  UserSettings,
  WorkPeriod,
} from "@/generated/prisma/client";
import type { DailyRecord } from "@shared/types/CoreTypes";
import type { EditDayOptions, EditWorkdayResult } from "@shared/types/ViewTypes";
import type { EditRecordState, EditAction, DailyRecordType, AbsenceRecordType, AbsencePortion } from "@shared/types/CoreTypes";
import { requiresPortionChoice, resolveAbsenceTerms } from "@shared/utils/recordTypeUtils";
import { requiredMinutesFor } from "@/utils/requiredMinutes";
import { toWorkPeriodViews } from "@/utils/workPeriodViews";
import { MAX_WORK_PERIODS_PER_DAY } from "@/constants/workPeriods";

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
// Periods are added, edited or deleted one at a time only while none is
// open — an open day is closed with SET_END_HOUR first.
const ALLOWED_ACTIONS: Record<EditRecordState, EditAction[]> = {
  OPEN_WORK_RECORD:     ["SET_END_HOUR", "SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL"],
  NO_RECORD:            ["SET_START_AND_END_HOURS", "MARK_ABSENCE"],
  CLOSED_WORK_RECORD:   [
    "SET_START_AND_END_HOURS", "ADD_WORK_PERIOD", "EDIT_WORK_PERIOD", "DELETE_WORK_PERIOD",
    "MARK_ABSENCE", "CANCEL",
  ],
  ABSENCE_RECORD:       ["SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL"],
  HALF_DAY_RECORD:      [
    "LOG_HOURS", "ADD_WORK_PERIOD", "EDIT_WORK_PERIOD", "DELETE_WORK_PERIOD",
    "SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL",
  ],
  HALF_DAY_OPEN_RECORD: ["SET_END_HOUR", "LOG_HOURS", "SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL"],
};

/** Period actions that need at least one period on the date. */
const PERIOD_ACTIONS: EditAction[] = ["ADD_WORK_PERIOD", "EDIT_WORK_PERIOD", "DELETE_WORK_PERIOD"];

/**
 * The actions that make sense for a date right now: ALLOWED_ACTIONS for its
 * state, minus the period actions when it has no periods yet (LOG_HOURS or
 * SET_START_AND_END_HOURS create the first one) and minus ADD_WORK_PERIOD
 * once it has MAX_WORK_PERIODS_PER_DAY.
 */
function availableActions(state: EditRecordState, periodCount: number): EditAction[] {
  return ALLOWED_ACTIONS[state].filter((action) => {
    if (PERIOD_ACTIONS.includes(action) && periodCount === 0) return false;
    if (action === "ADD_WORK_PERIOD" && periodCount >= MAX_WORK_PERIODS_PER_DAY) return false;
    return true;
  });
}

/** Loads a record's periods in start order; a record without hours has none (skips the query). */
async function loadPeriods(record: PrismaRecord | null): Promise<WorkPeriod[]> {
  return record?.startTime ? listWorkPeriods(record.id) : [];
}

type PeriodTimes = { startTime: Date; endTime: Date | null };

function sortByStart<P extends PeriodTimes>(periods: P[]): P[] {
  return [...periods].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * The record fields that mirror a day's periods once they're all closed:
 * the first start, the last end, their total, and the expected end of a
 * day that started at the first start. `periods` must be sorted and non-empty.
 */
function recordFieldsFromClosedPeriods(
  periods: PeriodTimes[],
  requiredMinutes: number,
  creditedMinutes: number
): { startTime: Date; endTime: Date | null; workedMinutes: number; expectedEndTime: Date } {
  const startTime = periods[0].startTime;
  return {
    startTime,
    endTime: periods[periods.length - 1].endTime,
    workedMinutes: calcPeriodsWorkedMinutes(periods),
    expectedEndTime: calcSessionExpectedEnd(startTime, requiredMinutes, creditedMinutes),
  };
}

/**
 * Throws INVALID_TIME_RANGE if [start, end) overlaps one of `periods`
 * (ignoring the period with id `ignoreId`, i.e. the one being edited).
 * Back-to-back periods (one ends at 15:00, the next starts at 15:00) are fine.
 */
function assertNoOverlap(
  periods: WorkPeriod[],
  startTime: Date,
  endTime: Date,
  timezone: string,
  ignoreId?: string
): void {
  const clashIndex = periods.findIndex(
    (p) =>
      p.id !== ignoreId &&
      // An open period runs on indefinitely.
      startTime.getTime() < (p.endTime?.getTime() ?? Infinity) &&
      p.startTime.getTime() < endTime.getTime()
  );
  if (clashIndex === -1) return;

  const clash = periods[clashIndex];
  const clashEnd = clash.endTime ? utcToLocalTime(clash.endTime, timezone) : "now";
  throw new AppError(
    "INVALID_TIME_RANGE",
    `That overlaps work period ${clashIndex + 1} (${utcToLocalTime(clash.startTime, timezone)}–${clashEnd}).`
  );
}

/** Returns period `periodNumber` (1-based, in start order) or throws VALIDATION_ERROR. */
function periodAt(periods: WorkPeriod[], periodNumber: number, ddMm: string): WorkPeriod {
  const period = Number.isInteger(periodNumber) ? periods[periodNumber - 1] : undefined;
  if (!period) {
    throw new AppError("VALIDATION_ERROR", `There is no work period ${periodNumber} on ${ddMm}.`);
  }
  return period;
}

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
  const periods = await loadPeriods(record);

  return {
    workDate: workDateStr,
    displayDate: ddMm,
    timezone: settings.timezone,
    state,
    record: record ? toSharedRecord(record, workDateStr) : null,
    periods: toWorkPeriodViews(periods),
    allowedActions: availableActions(state, periods.length),
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

/** Builds an EditWorkdayResult from a saved Prisma record, its periods and derived fields. */
function toEditWorkdayResult(
  prisma: PrismaRecord,
  workDateStr: string,
  ddMm: string,
  requiredMinutes: number,
  periods: PeriodTimes[]
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
    periods: toWorkPeriodViews(periods),
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
      "The end time must be after the start time."
    );
  }
  return { startTimeUtc, endTimeUtc };
}

/** Expected end of a session: start + whatever the absence credit doesn't cover. */
function calcSessionExpectedEnd(
  startTime: Date,
  requiredMinutes: number,
  creditedMinutes: number
): Date {
  return calcExpectedEndTime(startTime, Math.max(0, requiredMinutes - creditedMinutes));
}

// ── Action: SET_END_HOUR ──────────────────────────────────────────────────────

/**
 * Closes the open work period of an open day (a WORK record, or a half-day
 * absence with a session started) by applying the given HH:mm end time to the
 * edited date in the user's timezone. Earlier periods (and any absence) are
 * kept; the record's workedMinutes becomes the total of all its periods.
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

  // record is guaranteed non-null and an open session at this point
  const periods = await listWorkPeriods(record!.id);
  const openPeriod = periods.find((p) => p.endTime === null);
  if (!openPeriod) {
    throw new AppError("CONFLICT", "Open record has no open work period.");
  }

  const endTimeUtc = localTimeToUtc(workDateStr, endTimeHhMm, settings.timezone);
  if (endTimeUtc.getTime() <= openPeriod.startTime.getTime()) {
    throw new AppError(
      "INVALID_TIME_RANGE",
      "The end time must be after the start time."
    );
  }

  const closedPeriods = periods.map((p) =>
    p.id === openPeriod.id ? { ...p, endTime: endTimeUtc } : p
  );
  const workedMinutes = calcPeriodsWorkedMinutes(closedPeriods);

  const updated = await prisma.$transaction(async (tx) => {
    await updateWorkPeriod(openPeriod.id, { endTime: endTimeUtc }, tx);
    return updateDailyRecord(record!.id, { endTime: endTimeUtc, workedMinutes }, tx);
  });

  return toEditWorkdayResult(
    updated,
    workDateStr,
    ddMm,
    requiredMinutesFor(settings, workDateStr),
    closedPeriods
  );
}

// ── Action: SET_START_AND_END_HOURS ───────────────────────────────────────────

/**
 * Creates or replaces the record for the edited date as a closed WORK record
 * with the given start and end times (applied to the edited date, not today),
 * as a single work period — any periods the date had are replaced.
 * `expectedEndTime` is calculated as startTime + the date's required minutes
 * (see requiredMinutesFor).
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
  const requiredMinutes = requiredMinutesFor(settings, workDateStr);

  const existingRecord = await findRecordByDate(telegramId, workDate);
  assertActionAllowed(resolveState(existingRecord), "SET_START_AND_END_HOURS");

  const { startTimeUtc, endTimeUtc } = toUtcTimeRange(
    workDateStr,
    startTimeHhMm,
    endTimeHhMm,
    settings.timezone
  );
  const expectedEndTimeUtc = calcExpectedEndTime(startTimeUtc, requiredMinutes);
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

  // The record, its single period and any refund must succeed or fail together.
  const result = await prisma.$transaction(async (tx) => {
    const record = await upsertRecordByDate(upsertInput, tx);
    await deleteWorkPeriodsOfRecord(record.id, tx);
    const period = await createWorkPeriod(
      { dailyRecordId: record.id, startTime: startTimeUtc, endTime: endTimeUtc },
      tx
    );
    const refundedSettings = hasPreviousDebit
      ? await creditLeaveBalance(
          telegramId,
          previousField as LeaveBalanceField,
          previousDays as number,
          tx
        )
      : null;
    return { record, period, refundedSettings };
  });

  const leaveRefund: EditWorkdayResult["leaveRefund"] = result.refundedSettings
    ? {
        field: previousField as LeaveBalanceField,
        amount: previousDays as number,
        newBalance: result.refundedSettings[previousField as LeaveBalanceField],
      }
    : null;

  return {
    ...toEditWorkdayResult(result.record, workDateStr, ddMm, requiredMinutes, [result.period]),
    leaveRefund,
  };
}

// ── Action: LOG_HOURS ─────────────────────────────────────────────────────────

/**
 * Sets the worked hours on a half-day absence (e.g. the worked half of a
 * ½ vacation day or a holiday eve) as a single work period, replacing any
 * hours (periods) already logged.
 * The absence, its credit and its leave debit are kept untouched.
 * expectedEndTime is start + (the date's required minutes − creditedMinutes).
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

  const requiredMinutes = requiredMinutesFor(settings, workDateStr);

  const record = await findRecordByDate(telegramId, workDate);
  assertActionAllowed(resolveState(record), "LOG_HOURS");

  const { startTimeUtc, endTimeUtc } = toUtcTimeRange(
    workDateStr,
    startTimeHhMm,
    endTimeHhMm,
    settings.timezone
  );

  // record is guaranteed non-null and a half-day absence at this point
  const { updated, period } = await prisma.$transaction(async (tx) => {
    const updated = await updateDailyRecord(
      record!.id,
      {
        startTime: startTimeUtc,
        expectedEndTime: calcSessionExpectedEnd(startTimeUtc, requiredMinutes, record!.creditedMinutes),
        endTime: endTimeUtc,
        workedMinutes: calcWorkedMinutes(startTimeUtc, endTimeUtc),
      },
      tx
    );
    await deleteWorkPeriodsOfRecord(record!.id, tx);
    const period = await createWorkPeriod(
      { dailyRecordId: record!.id, startTime: startTimeUtc, endTime: endTimeUtc },
      tx
    );
    return { updated, period };
  });

  return toEditWorkdayResult(updated, workDateStr, ddMm, requiredMinutes, [period]);
}

// ── Actions: ADD / EDIT / DELETE a single work period ─────────────────────────

/**
 * Adds one closed work period (HH:mm start–end on the edited date) to a day
 * that already has hours — a closed work day or a half day with hours logged.
 * The record's first start, last end and worked total follow its periods.
 *
 * Throws:
 * - INVALID_TIME_FORMAT / INVALID_TIME_RANGE – bad times, or the period
 *   overlaps one the day already has.
 * - WORK_PERIOD_LIMIT_REACHED – the day already has MAX_WORK_PERIODS_PER_DAY.
 * - CONFLICT – the date has no hours yet (use SET_START_AND_END_HOURS /
 *   LOG_HOURS for the first period) or has an open period.
 */
export async function addWorkPeriod(
  telegramId: string,
  ddMm: string,
  startTimeHhMm: string,
  endTimeHhMm: string
): Promise<EditWorkdayResult> {
  assertStartEndFormat(startTimeHhMm, endTimeHhMm);

  const settings = await getSettingsOrThrow(telegramId);
  const workDateStr = resolveDdMmToDate(ddMm, settings.timezone);
  const requiredMinutes = requiredMinutesFor(settings, workDateStr);

  const record = await findRecordByDate(telegramId, localDateToUtcMidnight(workDateStr));
  assertActionAllowed(resolveState(record), "ADD_WORK_PERIOD");

  const periods = await loadPeriods(record);
  if (periods.length === 0) {
    throw new AppError("CONFLICT", `${ddMm} has no work periods yet.`);
  }
  if (periods.length >= MAX_WORK_PERIODS_PER_DAY) {
    throw new AppError(
      "WORK_PERIOD_LIMIT_REACHED",
      `${ddMm} already has ${MAX_WORK_PERIODS_PER_DAY} work periods.`,
      { max: MAX_WORK_PERIODS_PER_DAY }
    );
  }

  const { startTimeUtc, endTimeUtc } = toUtcTimeRange(
    workDateStr,
    startTimeHhMm,
    endTimeHhMm,
    settings.timezone
  );
  assertNoOverlap(periods, startTimeUtc, endTimeUtc, settings.timezone);

  const { updated, allPeriods } = await prisma.$transaction(async (tx) => {
    const added = await createWorkPeriod(
      { dailyRecordId: record!.id, startTime: startTimeUtc, endTime: endTimeUtc },
      tx
    );
    const allPeriods = sortByStart([...periods, added]);
    const updated = await updateDailyRecord(
      record!.id,
      recordFieldsFromClosedPeriods(allPeriods, requiredMinutes, record!.creditedMinutes),
      tx
    );
    return { updated, allPeriods };
  });

  return toEditWorkdayResult(updated, workDateStr, ddMm, requiredMinutes, allPeriods);
}

/**
 * Changes the start/end of work period `periodNumber` (1-based, in start
 * order) on a day with hours. The new range must not overlap the day's other
 * periods. The record's first start, last end and worked total follow.
 *
 * Throws:
 * - INVALID_TIME_FORMAT / INVALID_TIME_RANGE – bad times, or an overlap.
 * - VALIDATION_ERROR – there is no such period.
 * - CONFLICT – the date has no hours, or has an open period.
 */
export async function editWorkPeriod(
  telegramId: string,
  ddMm: string,
  periodNumber: number,
  startTimeHhMm: string,
  endTimeHhMm: string
): Promise<EditWorkdayResult> {
  assertStartEndFormat(startTimeHhMm, endTimeHhMm);

  const settings = await getSettingsOrThrow(telegramId);
  const workDateStr = resolveDdMmToDate(ddMm, settings.timezone);
  const requiredMinutes = requiredMinutesFor(settings, workDateStr);

  const record = await findRecordByDate(telegramId, localDateToUtcMidnight(workDateStr));
  assertActionAllowed(resolveState(record), "EDIT_WORK_PERIOD");

  const periods = await loadPeriods(record);
  const target = periodAt(periods, periodNumber, ddMm);

  const { startTimeUtc, endTimeUtc } = toUtcTimeRange(
    workDateStr,
    startTimeHhMm,
    endTimeHhMm,
    settings.timezone
  );
  assertNoOverlap(periods, startTimeUtc, endTimeUtc, settings.timezone, target.id);

  const allPeriods = sortByStart(
    periods.map((p) =>
      p.id === target.id ? { ...p, startTime: startTimeUtc, endTime: endTimeUtc } : p
    )
  );

  const updated = await prisma.$transaction(async (tx) => {
    await updateWorkPeriod(target.id, { startTime: startTimeUtc, endTime: endTimeUtc }, tx);
    return updateDailyRecord(
      record!.id,
      recordFieldsFromClosedPeriods(allPeriods, requiredMinutes, record!.creditedMinutes),
      tx
    );
  });

  return toEditWorkdayResult(updated, workDateStr, ddMm, requiredMinutes, allPeriods);
}

/**
 * Deletes work period `periodNumber` (1-based, in start order) from a day
 * with hours. The record's first start, last end and worked total follow.
 *
 * Deleting the day's last period:
 * - on a work day, deletes the record — returns null (the date has no record).
 * - on a half day, clears its hours and keeps the absence, credit and debit.
 *
 * Throws:
 * - VALIDATION_ERROR – there is no such period.
 * - CONFLICT – the date has no hours, or has an open period.
 */
export async function removeWorkPeriod(
  telegramId: string,
  ddMm: string,
  periodNumber: number
): Promise<EditWorkdayResult | null> {
  const settings = await getSettingsOrThrow(telegramId);
  const workDateStr = resolveDdMmToDate(ddMm, settings.timezone);
  const requiredMinutes = requiredMinutesFor(settings, workDateStr);

  const record = await findRecordByDate(telegramId, localDateToUtcMidnight(workDateStr));
  assertActionAllowed(resolveState(record), "DELETE_WORK_PERIOD");

  const periods = await loadPeriods(record);
  const target = periodAt(periods, periodNumber, ddMm);
  const remaining = periods.filter((p) => p.id !== target.id);

  if (remaining.length === 0 && record!.recordType === "WORK") {
    // A work day never carries a leave debit, so there is nothing to refund.
    await deleteDailyRecord(record!.id);
    return null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await deleteWorkPeriod(target.id, tx);
    return updateDailyRecord(
      record!.id,
      remaining.length > 0
        ? recordFieldsFromClosedPeriods(remaining, requiredMinutes, record!.creditedMinutes)
        : // Half day without hours, as MARK_ABSENCE leaves it.
          { startTime: null, expectedEndTime: null, endTime: null, workedMinutes: 0 },
      tx
    );
  });

  return toEditWorkdayResult(updated, workDateStr, ddMm, requiredMinutes, remaining);
}

// ── Action: MARK_ABSENCE ──────────────────────────────────────────────────────

/**
 * Creates or replaces the record for the edited date as an absence record.
 * What the absence credits and debits comes from
 * resolveAbsenceTerms (the single source of truth for the rules):
 *   - creditedMinutes: full or half of the date's required minutes (see
 *     requiredMinutesFor; 0 for UNPAID_ABSENCE)
 *   - debit: VACATION/SICK debit 1 or 0.5 day of their balance; HOLIDAY_EVE
 *     FULL debits 0.5 vacation; other types debit nothing.
 *
 * Logged hours: when the new absence is a half day (allowsWorkHours) and the
 * date already has hours (e.g. a work day being re-marked as ½ vacation, or
 * one half-day type changed to another), the hours and their work periods
 * are kept and expectedEndTime is recomputed for the new credit. Otherwise
 * all timestamps are set to null, workedMinutes to 0, and the date's work
 * periods are deleted.
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
  const requiredMinutes = requiredMinutesFor(settings, workDateStr);

  const terms = resolveAbsenceTerms(
    absenceType,
    portion ?? (absenceType === "HOLIDAY_EVE" ? "HALF" : "FULL"),
    requiredMinutes
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
  // The date had hours that this absence clears — its periods go with them.
  const dropsPeriods = !keepHours && (existingRecord?.startTime ?? null) !== null;
  const keptPeriods = keepHours ? await loadPeriods(existingRecord) : [];

  const upsertInput = {
    telegramId,
    workDate,
    recordType: absenceType,
    absencePortion: terms.portion,
    startTime: keptStartTime,
    expectedEndTime: keepHours
      ? calcSessionExpectedEnd(keptStartTime, requiredMinutes, terms.creditedMinutes)
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

  if (balanceField !== null || hasPreviousDebit || dropsPeriods) {
    // The record upsert, any period cleanup and any refund/debit must succeed
    // or fail together — otherwise a mid-write failure could leave a saved
    // record with no matching balance change (or stale periods).
    const result = await prisma.$transaction(async (tx) => {
      const record = await upsertRecordByDate(upsertInput, tx);

      if (dropsPeriods) {
        await deleteWorkPeriodsOfRecord(record.id, tx);
      }

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
    ...toEditWorkdayResult(saved, workDateStr, ddMm, requiredMinutes, keptPeriods),
    leaveDebit,
    leaveRefund,
  };
}
