import type {
  AbsencePortion,
  DailyRecord,
  DailyRecordId,
  DailyRecordType,
  EditAction,
  EditRecordState,
  RecordLookupState,
  TelegramId,
} from "./CoreTypes";

// --- WorkPeriodView ---

/** One start/end period of a day (a day can have several, e.g. office then home). */
export interface WorkPeriodView {
  /** UTC timestamp */
  startTime: string;
  /** UTC timestamp. null while the period is still open */
  endTime: string | null;
  /** Minutes worked in this period — counted up to now while it is open */
  workedMinutes: number;
}

// --- WorkdayStatus ---

/** Returned by the /status command. All time calculations are live (not stored). */
export interface WorkdayStatus {
  /** YYYY-MM-DD */
  workDate: string;
  /** UTC timestamp of the day's first start */
  startTime: string;
  /** UTC timestamp */
  expectedEndTime: string;
  /** Today's periods in start order; the last one is open */
  periods: WorkPeriodView[];
  /** Integer >= 0: all of today's periods, the open one counted up to now */
  workedMinutesSoFar: number;
  /** Minutes already credited to the day by a half-day absence (0 on a regular workday) */
  creditedMinutes: number;
  /** The day's required minutes (reduced on Chol HaMoed when the user set those hours) */
  requiredMinutes: number;
  /** Integer >= 0, clamped to 0 when worked + credited already meets the required minutes */
  remainingMinutes: number;
  isActive: boolean;
}

// --- EndWorkdayResult ---

/** Returned by the /end command. */
export interface EndWorkdayResult {
  id: DailyRecordId;
  telegramId: TelegramId;
  /** YYYY-MM-DD */
  workDate: string;
  /** UTC timestamp of the day's first start */
  startTime: string;
  /** UTC timestamp */
  expectedEndTime: string;
  /** UTC timestamp */
  endTime: string;
  /** Today's periods in start order, all closed; the last one was just ended */
  periods: WorkPeriodView[];
  /** Integer >= 0: the total of all of today's periods */
  workedMinutes: number;
  /** Minutes credited to the day by a half-day absence (0 on a regular workday) */
  creditedMinutes: number;
  requiredMinutes: number;
  /** workedMinutes + creditedMinutes - requiredMinutes; positive = overtime, negative = under */
  balanceMinutes: number;
}

// --- EditDayOptions ---

/** Returned by GET /workdays/edit/:telegramId/:date */
export interface EditDayOptions {
  /** YYYY-MM-DD */
  workDate: string;
  /** dd-mm */
  displayDate: string;
  /** IANA timezone resolved from user settings */
  timezone: string;
  state: EditRecordState;
  /** null when state is NO_RECORD */
  record: DailyRecord | null;
  /** The date's work periods in start order (an open one counted up to now); empty when no hours are logged */
  periods: WorkPeriodView[];
  allowedActions: EditAction[];
}

// --- EditWorkdayResult ---

/** Returned by PATCH /workdays/edit/:telegramId/:date */
export interface EditWorkdayResult {
  id: DailyRecordId;
  telegramId: TelegramId;
  /** YYYY-MM-DD */
  workDate: string;
  /** dd-mm */
  displayDate: string;
  recordType: DailyRecordType;
  /** How much of the day the absence covers. null for WORK records. */
  absencePortion: AbsencePortion | null;
  /** UTC timestamp. null for full-day absence records */
  startTime?: string | null;
  /** UTC timestamp. null for full-day absence records */
  expectedEndTime?: string | null;
  /** UTC timestamp. null for full-day absence records */
  endTime?: string | null;
  /** Actual worked minutes (the total of all periods), integer >= 0 */
  workedMinutes: number;
  /** The date's work periods after the edit, in start order; empty when no hours are logged */
  periods: WorkPeriodView[];
  /** Minutes credited by the absence (leave or company-paid time). 0 for WORK records. */
  creditedMinutes: number;
  requiredMinutes: number;
  /** workedMinutes + creditedMinutes - requiredMinutes; positive = overtime, negative = under */
  balanceMinutes: number;
  /**
   * Present only when MARK_ABSENCE debited a leave balance (VACATION, SICK,
   * or HOLIDAY_EVE with the other half taken as vacation). null for
   * SET_END_HOUR, SET_START_AND_END_HOURS, and non-debiting absences.
   */
  leaveDebit?: {
    field: "vacationBalance" | "sickBalance";
    amount: number;
    newBalance: number;
  } | null;
  /**
   * Present when this edit changed or removed a date's previous debitable
   * absence type (MARK_ABSENCE to a different type/amount, or
   * SET_START_AND_END_HOURS overwriting a previously-debited absence day) —
   * the amount the date previously debited, given back before any new debit
   * was applied. Independent of leaveDebit: both, either, or neither may be
   * present depending on what the previous and new state were.
   */
  leaveRefund?: {
    field: "vacationBalance" | "sickBalance";
    amount: number;
    newBalance: number;
  } | null;
}

// --- DateRecordLookup ---

type DateRecordLookupBase = {
  /** YYYY-MM-DD */
  workDate: string;
  /** dd-mm */
  displayDate: string;
  /** IANA timezone resolved from user settings */
  timezone: string;
  /** The day's work periods in start order (an open one counted up to now); empty when no hours are logged */
  periods: WorkPeriodView[];
};

/**
 * Returned by GET /workdays/record/:telegramId/:date (read-only /record dd-mm lookup).
 * Discriminated by `state` so consumers can narrow `record` without non-null assertions.
 */
export type DateRecordLookup =
  | (DateRecordLookupBase & { state: "NO_RECORD"; record: null })
  | (DateRecordLookupBase & { state: Exclude<RecordLookupState, "NO_RECORD">; record: DailyRecord });

// --- SummaryPeriod ---

export type SummaryPeriod = "week" | "month";

// --- WorkSummary ---

/** Returned by the /week and /month commands. */
export interface WorkSummary {
  period: SummaryPeriod;
  /** YYYY-MM-DD — present for week summaries */
  startDate?: string;
  /** YYYY-MM-DD — present for week summaries */
  endDate?: string;
  /** YYYY-MM — present for month summaries */
  month?: string;
  workdaysCount: number;
  requiredMinutes: number;
  /** Actual worked minutes */
  workedMinutes: number;
  /** Minutes credited by absences (leave or company-paid time) */
  creditedMinutes: number;
  /** workedMinutes + creditedMinutes - requiredMinutes */
  balanceMinutes: number;
}
