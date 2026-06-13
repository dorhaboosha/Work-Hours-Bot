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

// --- DailyRecord ---

export interface DailyRecord {
  id: DailyRecordId;
  telegramId: TelegramId;
  /** Local work date in user's timezone. Format: YYYY-MM-DD */
  workDate: string;
  /** UTC timestamp */
  startTime: string;
  /** UTC timestamp */
  expectedEndTime: string;
  /** UTC timestamp. null while the workday is active */
  endTime?: string | null;
  /** Integer >= 0. null until the workday is ended */
  workedMinutes?: number | null;
  /** ISO datetime */
  createdAt: string;
  /** ISO datetime */
  updatedAt: string;
}
