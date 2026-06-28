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
  /** IANA timezone string. Example: "Asia/Jerusalem" */
  timezone: string;
  /** Configured workdays. Example: [0, 1, 2, 3, 4] = Sunday–Thursday */
  workdays: Weekday[];
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
  | "ABSENCE_RECORD";

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
  | "MARK_ABSENCE"
  | "CANCEL";

// --- DailyRecord ---

export interface DailyRecord {
  id: DailyRecordId;
  telegramId: TelegramId;
  /** Local work date in user's timezone. Format: YYYY-MM-DD */
  workDate: string;
  recordType: DailyRecordType;
  /** UTC timestamp. null for absence records */
  startTime?: string | null;
  /** UTC timestamp. null for absence records */
  expectedEndTime?: string | null;
  /** UTC timestamp. null while a WORK record is active, or for absence records */
  endTime?: string | null;
  /** Integer >= 0. null only while a WORK record is active */
  workedMinutes?: number | null;
  /** ISO datetime */
  createdAt: string;
  /** ISO datetime */
  updatedAt: string;
}
