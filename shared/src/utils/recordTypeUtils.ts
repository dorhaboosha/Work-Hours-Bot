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
 * Returns true for absence types where the user must choose a full or half
 * day (VACATION, SICK). Every other type has a fixed portion.
 */
export function requiresPortionChoice(recordType: AbsenceRecordType): boolean {
  return recordType === "VACATION" || recordType === "SICK";
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
