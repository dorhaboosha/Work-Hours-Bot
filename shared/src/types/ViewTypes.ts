import type { DailyRecordId, TelegramId } from "./CoreTypes";

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
