// --- ID aliases ---

export type UserSettingsId = string;
export type DailyRecordId = string;
export type TelegramId = string;
/** HH:mm 24-hour format, e.g. "17:30" */
export type ManualEndTime = string;

// --- Weekday ---

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export const SUNDAY_TO_THURSDAY: Weekday[] = [0, 1, 2, 3, 4];
export const MONDAY_TO_FRIDAY: Weekday[] = [1, 2, 3, 4, 5];

// --- UserSettings ---

export interface UserSettings {
  id: UserSettingsId;
  telegramId: TelegramId;
  /** Required daily work time in minutes, integer > 0. Example: 528 = 8h 48m */
  dailyRequiredMinutes: number;
  /** Required minutes on Chol HaMoed days (Sukkot/Pesach). null = same as dailyRequiredMinutes. */
  cholHamoedRequiredMinutes: number | null;
  /** IANA timezone string. Example: "Asia/Jerusalem" */
  timezone: string;
  /** Configured workdays. Example: [0, 1, 2, 3, 4] = Sunday–Thursday */
  workdays: Weekday[];
  /** Vacation days accrued per elapsed calendar month. Default 1. */
  vacationAccrualRate: number;
  /** Sick days accrued per elapsed calendar month. Default 1.5. */
  sickAccrualRate: number;
  /** Current vacation day balance. May be negative. Multiple of 0.5. */
  vacationBalance: number;
  /** Current sick day balance. May be negative. Multiple of 0.5. */
  sickBalance: number;
  /** ISO datetime */
  createdAt: string;
  /** ISO datetime */
  updatedAt: string;
}

// --- Daily record types ---

export type DailyRecordType =
  | "WORK"
  | "SICK"
  | "VACATION"
  | "HOLIDAY"
  | "HOLIDAY_EVE"
  | "UNPAID_ABSENCE"
  | "ELECTION";

/** All record types that represent absences or paid days off (i.e. not WORK) */
export type AbsenceRecordType =
  | "SICK"
  | "VACATION"
  | "HOLIDAY"
  | "HOLIDAY_EVE"
  | "UNPAID_ABSENCE"
  | "ELECTION";

/**
 * How much of the day an absence record covers.
 * - FULL: the absence covers the whole day; no work hours can be logged on it.
 * - HALF: the absence covers half the day; the other half can be logged as work hours.
 * For HOLIDAY_EVE the company always covers half: FULL means the other half
 * was taken as vacation, HALF means the other half was (or will be) worked.
 */
export type AbsencePortion = "FULL" | "HALF";

export const DAILY_RECORD_TYPE_LABELS: Record<DailyRecordType, string> = {
  WORK: "Work",
  SICK: "Sick day",
  VACATION: "Vacation day",
  HOLIDAY: "Holiday",
  HOLIDAY_EVE: "Holiday eve",
  UNPAID_ABSENCE: "Unpaid absence",
  ELECTION: "Election day",
};

// --- Edit-day types ---

/** The state of a date when the user runs /edit dd-mm */
export type EditRecordState =
  | "OPEN_WORK_RECORD"
  | "NO_RECORD"
  | "CLOSED_WORK_RECORD"
  | "ABSENCE_RECORD"
  /** Half-day absence with no open work session (hours may or may not be logged). */
  | "HALF_DAY_RECORD"
  /** Half-day absence with an open work session (started, not ended). */
  | "HALF_DAY_OPEN_RECORD";

/** The state of a date returned by the read-only /record dd-mm lookup */
export type RecordLookupState =
  | "COMPLETED_WORK_RECORD"
  | "OPEN_WORK_RECORD"
  | "ABSENCE_RECORD"
  | "NO_RECORD";

/** The action the user can take when editing a specific date */
export type EditAction =
  | "SET_END_HOUR"
  | "SET_START_AND_END_HOURS"
  /** Set the worked hours on a half-day absence, keeping the absence. */
  | "LOG_HOURS"
  /** Add one more closed work period to a day that already has hours. */
  | "ADD_WORK_PERIOD"
  /** Change the start/end of one work period. */
  | "EDIT_WORK_PERIOD"
  /** Remove one work period. */
  | "DELETE_WORK_PERIOD"
  | "MARK_ABSENCE"
  | "CANCEL";

// --- DailyRecord ---

export interface DailyRecord {
  id: DailyRecordId;
  telegramId: TelegramId;
  /** Local work date in user's timezone. Format: YYYY-MM-DD */
  workDate: string;
  recordType: DailyRecordType;
  /** How much of the day the absence covers. null for WORK records. */
  absencePortion?: AbsencePortion | null;
  /** UTC timestamp. null for absence records */
  startTime?: string | null;
  /** UTC timestamp. null for absence records */
  expectedEndTime?: string | null;
  /** UTC timestamp. null while a WORK record is active, or for absence records */
  endTime?: string | null;
  /** Actual worked minutes, integer >= 0. 0 for full-day absences; null only while a work session is active */
  workedMinutes?: number | null;
  /** Minutes credited by the absence (leave or company-paid time). 0 for WORK records. */
  creditedMinutes?: number;
  /** Which leave balance this record currently debits, if any. null for WORK and non-debitable absence types. */
  debitedLeaveField?: "vacationBalance" | "sickBalance" | null;
  /** The amount debited for this record, if any. null when debitedLeaveField is null. */
  debitedLeaveDays?: number | null;
  /** ISO datetime */
  createdAt: string;
  /** ISO datetime */
  updatedAt: string;
}
