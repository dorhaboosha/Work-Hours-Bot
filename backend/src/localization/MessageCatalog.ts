import type { Weekday, AbsenceRecordType } from "@shared/types/CoreTypes";

// ── Parameter shapes ──────────────────────────────────────────────────────────

export interface WorkdayStartedOpts {
  startStr: string;
  endStr: string;
  durationStr: string;
}

export interface TodayStatusOpts {
  workDate: string;
  startStr: string;
  endStr: string;
  workedStr: string;
  remainingStr: string;
  requiredStr: string;
  balanceStr: string;
  goalReached: boolean;
}

export interface WorkdayEndedOpts {
  workDate: string;
  startStr: string;
  endStr: string;
  workedStr: string;
  requiredStr: string;
  balanceStr: string;
  balancePositive: boolean;
}

export interface WeekSummaryOpts {
  startDate: string;
  endDate: string;
  workdaysCount: number;
  requiredStr: string;
  workedStr: string;
  balanceStr: string;
  balancePositive: boolean;
}

export interface MonthSummaryOpts {
  month: string;
  workdaysCount: number;
  requiredStr: string;
  workedStr: string;
  balanceStr: string;
  balancePositive: boolean;
}

export interface SettingsDisplayOpts {
  dailyHoursStr: string;
  workdaysStr: string;
  timezone: string;
  languageLabel: string;
}

export interface EditSavedOpts {
  date: string;
  startStr: string;
  endStr: string;
  workedStr: string;
  balanceStr: string;
}

export interface EditAbsenceSavedOpts {
  date: string;
  absenceLabel: string;
  creditedStr: string;
  balanceStr: string;
}

// ── Catalog interface ─────────────────────────────────────────────────────────

export interface MessageCatalog {
  // Localised day and absence names
  weekdayNames: Record<Weekday, string>;
  absenceTypeNames: Record<AbsenceRecordType, string>;

  // /start
  workdayStarted(opts: WorkdayStartedOpts): string;

  // /status
  todayStatus(opts: TodayStatusOpts): string;

  // /end
  workdayEnded(opts: WorkdayEndedOpts): string;

  // /week
  weekSummary(opts: WeekSummaryOpts): string;

  // /month
  monthSummary(opts: MonthSummaryOpts): string;

  // /settings
  settingsDisplay(opts: SettingsDisplayOpts): string;

  // /setup – already completed variant (shows current settings)
  setupAlreadyCompleted(opts: SettingsDisplayOpts): string;

  // /help
  help: string;

  // /edit dd-mm – state prompts
  editDayOpenRecord(opts: { date: string }): string;
  editDayNoRecord(opts: { date: string }): string;
  editDayClosedRecord(opts: { date: string }): string;
  editDayAbsenceRecord(opts: { date: string; absenceLabel: string }): string;

  // /edit dd-mm – input prompts
  editPromptEndHour: string;
  editPromptStartAndEndHours: string;
  editAbsenceTypeList: string;

  // /edit dd-mm – success replies
  editEndHourSaved(opts: EditSavedOpts): string;
  editStartEndSaved(opts: EditSavedOpts): string;
  editAbsenceSaved(opts: EditAbsenceSavedOpts): string;
  editCancelled: string;

  // Error messages
  errors: {
    userSettingsNotFound: string;
    dailyRecordAlreadyExists: string;
    activeRecordNotFound: string;
    dailyRecordAlreadyClosed: string;
    previousRecordStillOpen(message: string): string;
    setupAlreadyCompleted: string;
    validationError(message: string): string;
    unknown: string;
  };
}
