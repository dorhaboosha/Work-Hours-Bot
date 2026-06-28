import type {
  DailyRecord,
  DailyRecordId,
  DailyRecordType,
  EditAction,
  EditRecordState,
  RecordLookupState,
  TelegramId,
} from "./CoreTypes";

// --- WorkdayStatus ---

/** Returned by the /status command. All time calculations are live (not stored). */
export interface WorkdayStatus {
  /** YYYY-MM-DD */
  workDate: string;
  /** UTC timestamp */
  startTime: string;
  /** UTC timestamp */
  expectedEndTime: string;
  /** Integer >= 0, computed from startTime to now */
  workedMinutesSoFar: number;
  /** Integer >= 0, clamped to 0 when the user has already met their required minutes */
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
  /** UTC timestamp */
  startTime: string;
  /** UTC timestamp */
  expectedEndTime: string;
  /** UTC timestamp */
  endTime: string;
  /** Integer >= 0 */
  workedMinutes: number;
  requiredMinutes: number;
  /** workedMinutes - requiredMinutes; positive = overtime, negative = under */
  balanceMinutes: number;
}

// --- EditDayOptions ---

/** Returned by GET /workdays/edit/:telegramId/:date */
export interface EditDayOptions {
  /** YYYY-MM-DD */
  workDate: string;
  /** dd-mm */
  displayDate: string;
  state: EditRecordState;
  /** null when state is NO_RECORD */
  record: DailyRecord | null;
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
  /** UTC timestamp. null for absence records */
  startTime?: string | null;
  /** UTC timestamp. null for absence records */
  expectedEndTime?: string | null;
  /** UTC timestamp. null for absence records */
  endTime?: string | null;
  /** Integer >= 0 */
  workedMinutes: number;
  requiredMinutes: number;
  /** workedMinutes - requiredMinutes; positive = overtime, negative = under */
  balanceMinutes: number;
}

// --- DateRecordLookup ---

type DateRecordLookupBase = {
  /** YYYY-MM-DD */
  workDate: string;
  /** dd-mm */
  displayDate: string;
  /** IANA timezone resolved from user settings */
  timezone: string;
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
  workedMinutes: number;
  /** workedMinutes - requiredMinutes */
  balanceMinutes: number;
}
