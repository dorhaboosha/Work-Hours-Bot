import type { ManualEndTime, TelegramId, Weekday } from "./CoreTypes";

// --- Settings ---

/** POST /settings/setup */
export interface SetupUserSettingsInput {
  telegramId: TelegramId;
  /** Integer > 0. Example: 528 = 8h 48m */
  dailyRequiredMinutes: number;
  /** IANA timezone string. Example: "Asia/Jerusalem" */
  timezone: string;
  /** At least one day. Example: [0, 1, 2, 3, 4] = Sunday–Thursday */
  workdays: Weekday[];
}

// --- Workday ---

/** POST /workdays/start */
export interface StartWorkdayInput {
  telegramId: TelegramId;
}

/**
 * POST /workdays/end
 * Supports both `/end` (today's active workday) and `/end HH:mm` (previous unfinished workday).
 * When the open record is from a previous local date, `manualEndTime` is required.
 */
export interface EndWorkdayInput {
  telegramId: TelegramId;
  /** HH:mm 24-hour format. Applied to the original workDate, not the current date. */
  manualEndTime?: ManualEndTime;
}

// --- Summary queries ---

/** GET /summaries/week/:telegramId */
export interface WeekSummaryQuery {
  /** Optional reference date in YYYY-MM-DD format. Defaults to today in user's timezone. */
  date?: string;
}

/** GET /summaries/month/:telegramId */
export interface MonthSummaryQuery {
  /** Optional month in YYYY-MM format. Defaults to current month in user's timezone. */
  month?: string;
}

// --- Records list query ---

/** GET /workdays/:telegramId */
export interface DailyRecordsQuery {
  /** Start of date range in YYYY-MM-DD format */
  from?: string;
  /** End of date range in YYYY-MM-DD format */
  to?: string;
}
