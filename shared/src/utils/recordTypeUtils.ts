import type { AbsencePortion, AbsenceRecordType, DailyRecordType } from "../types/CoreTypes";

/**
 * Returns true when `recordType` is an absence or paid day-off type (i.e. not WORK).
 * Acts as a TypeScript type guard narrowing to AbsenceRecordType.
 */
export function isAbsenceRecordType(
  recordType: DailyRecordType
): recordType is AbsenceRecordType {
  return recordType !== "WORK";
}

/**
 * Calculates the minutes to credit for an absence record based on the user's
 * daily required minutes and the absence credit rule:
 * - SICK / VACATION / HOLIDAY / ELECTION → full required day
 * - HOLIDAY_EVE                          → half required day (floor)
 * - UNPAID_ABSENCE                       → 0
 */
export function calculateCreditedMinutes(
  recordType: AbsenceRecordType,
  dailyRequiredMinutes: number
): number {
  switch (recordType) {
    case "SICK":
    case "VACATION":
    case "HOLIDAY":
    case "ELECTION":
      return dailyRequiredMinutes;

    case "HOLIDAY_EVE":
      return Math.floor(dailyRequiredMinutes / 2);

    case "UNPAID_ABSENCE":
      return 0;
  }
}

/**
 * Maps an absence type to the leave balance it debits when marked, if any.
 * Independent of calculateCreditedMinutes: the debited amount is a
 * user-chosen number of leave-balance days, unrelated to how many work-
 * minutes the day is credited for.
 * - VACATION                                     → vacationBalance
 * - SICK                                         → sickBalance
 * - HOLIDAY / HOLIDAY_EVE / ELECTION / UNPAID_ABSENCE → no balance debited
 *   (holidays, holiday eves and election day are company-paid leave)
 */
export function getLeaveBalanceField(
  recordType: AbsenceRecordType
): "vacationBalance" | "sickBalance" | null {
  switch (recordType) {
    case "VACATION":
      return "vacationBalance";

    case "SICK":
      return "sickBalance";

    case "HOLIDAY":
    case "HOLIDAY_EVE":
    case "UNPAID_ABSENCE":
    case "ELECTION":
      return null;
  }
}

/** What marking an absence of a given type and portion credits and debits. */
export interface AbsenceTerms {
  /** The effective portion — fixed to FULL for types that can't be split. */
  portion: AbsencePortion;
  /** Minutes credited toward the day's required time. */
  creditedMinutes: number;
  /** Leave balance debited, if any. */
  debitField: "vacationBalance" | "sickBalance" | null;
  /** Leave days debited. null when debitField is null. */
  debitDays: number | null;
  /** Whether work hours can be logged on the same day alongside the absence. */
  allowsWorkHours: boolean;
}

/**
 * Single source of truth for how an absence is credited and debited.
 * Half a day is floor(dailyRequiredMinutes / 2).
 *
 * | Type           | Portion | Credited | Debit        | Work hours |
 * |----------------|---------|----------|--------------|------------|
 * | HOLIDAY        | FULL*   | full     | —            | no         |
 * | ELECTION       | FULL*   | full     | —            | no         |
 * | UNPAID_ABSENCE | FULL*   | 0        | —            | no         |
 * | VACATION       | FULL    | full     | 1 vacation   | no         |
 * | VACATION       | HALF    | half     | 0.5 vacation | yes        |
 * | SICK           | FULL    | full     | 1 sick       | no         |
 * | SICK           | HALF    | half     | 0.5 sick     | yes        |
 * | HOLIDAY_EVE    | FULL    | full     | 0.5 vacation | no         |
 * | HOLIDAY_EVE    | HALF    | half     | —            | yes        |
 *
 * (*) The requested portion is ignored and normalized to FULL.
 * For HOLIDAY_EVE the company-paid half is always credited; FULL means the
 * other half was taken as vacation, HALF means it was worked.
 */
export function resolveAbsenceTerms(
  recordType: AbsenceRecordType,
  portion: AbsencePortion,
  dailyRequiredMinutes: number
): AbsenceTerms {
  const fullDay = dailyRequiredMinutes;
  const halfDay = Math.floor(dailyRequiredMinutes / 2);
  const isHalf = portion === "HALF";

  switch (recordType) {
    case "HOLIDAY":
    case "ELECTION":
      return { portion: "FULL", creditedMinutes: fullDay, debitField: null, debitDays: null, allowsWorkHours: false };

    case "UNPAID_ABSENCE":
      return { portion: "FULL", creditedMinutes: 0, debitField: null, debitDays: null, allowsWorkHours: false };

    case "VACATION":
    case "SICK":
      return {
        portion,
        creditedMinutes: isHalf ? halfDay : fullDay,
        debitField: recordType === "VACATION" ? "vacationBalance" : "sickBalance",
        debitDays: isHalf ? 0.5 : 1,
        allowsWorkHours: isHalf,
      };

    case "HOLIDAY_EVE":
      return isHalf
        ? { portion, creditedMinutes: halfDay, debitField: null, debitDays: null, allowsWorkHours: true }
        : { portion, creditedMinutes: fullDay, debitField: "vacationBalance", debitDays: 0.5, allowsWorkHours: false };
  }
}

/**
 * Returns true when work hours can be logged on a record: always for WORK,
 * and for absences that cover only half the day.
 */
export function canLogHours(record: {
  recordType: DailyRecordType;
  absencePortion?: AbsencePortion | null;
}): boolean {
  return record.recordType === "WORK" || record.absencePortion === "HALF";
}
