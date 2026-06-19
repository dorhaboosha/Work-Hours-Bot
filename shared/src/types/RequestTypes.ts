import type {
  AbsenceRecordType,
  ManualEndTime,
  TelegramId,
  Weekday,
} from "./CoreTypes";

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

// --- Edit-day ---

/** Path params for GET /workdays/edit/:telegramId/:date */
export interface EditDayParams {
  telegramId: TelegramId;
  /** dd-mm format, e.g. "12-06" */
  date: string;
}

/**
 * Body for SET_END_HOUR action on PATCH /workdays/edit/:telegramId/:date.
 * Only allowed when the date has an open WORK record.
 * The end time is applied to the edited date, not the current date.
 */
export interface SetEndHourInput {
  action: "SET_END_HOUR";
  /** HH:mm 24-hour format */
  endTime: string;
}

/**
 * Body for SET_START_AND_END_HOURS action on PATCH /workdays/edit/:telegramId/:date.
 * Creates or replaces a WORK record for the edited date.
 */
export interface SetStartAndEndHoursInput {
  action: "SET_START_AND_END_HOURS";
  /** HH:mm 24-hour format */
  startTime: string;
  /** HH:mm 24-hour format */
  endTime: string;
}

/** Body for MARK_ABSENCE action on PATCH /workdays/edit/:telegramId/:date. */
export interface MarkAbsenceInput {
  action: "MARK_ABSENCE";
  recordType: AbsenceRecordType;
}

/** Discriminated union for PATCH /workdays/edit/:telegramId/:date */
export type EditWorkdayInput =
  | SetEndHourInput
  | SetStartAndEndHoursInput
  | MarkAbsenceInput;

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
