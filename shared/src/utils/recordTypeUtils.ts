import type { AbsenceRecordType, DailyRecordType } from "../types/CoreTypes";

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
