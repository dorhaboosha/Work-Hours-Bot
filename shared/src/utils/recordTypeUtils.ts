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

/**
 * Maps an absence type to the leave balance it debits when marked, if any.
 * Independent of calculateCreditedMinutes: the debited amount is a
 * user-chosen number of leave-balance days, unrelated to how many work-
 * minutes the day is credited for.
 * - VACATION / HOLIDAY / HOLIDAY_EVE → vacationBalance
 * - SICK                             → sickBalance
 * - UNPAID_ABSENCE / ELECTION        → no balance debited
 */
export function getLeaveBalanceField(
  recordType: AbsenceRecordType
): "vacationBalance" | "sickBalance" | null {
  switch (recordType) {
    case "VACATION":
    case "HOLIDAY":
    case "HOLIDAY_EVE":
      return "vacationBalance";

    case "SICK":
      return "sickBalance";

    case "UNPAID_ABSENCE":
    case "ELECTION":
      return null;
  }
}
