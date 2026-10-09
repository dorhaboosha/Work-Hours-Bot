import type { EditDayOptions, EditWorkdayResult } from "@shared/types/ViewTypes";
import type { DailyRecordType } from "@shared/types/CoreTypes";
import { isAbsenceRecordType } from "@shared/utils/recordTypeUtils";
import type { EditMenuEntry } from "@/constants/editActions";
import {
  formatBalance,
  formatMinutesAsDuration,
  formatWorkPeriodsBlock,
} from "@/bot/utils/formatMessage";
import { t } from "@/i18n";

/** The label of the date's absence type ("Vacation day", …), or "absence" when it has none. */
function absenceLabelOf(recordType: DailyRecordType | undefined): string {
  return recordType && isAbsenceRecordType(recordType)
    ? t(`absenceType.${recordType}`)
    : recordType ?? "absence";
}

/**
 * The /edit menu for a date: its state header, its work periods (numbered,
 * so "Edit/Delete a work period" can refer to them) and the numbered options.
 */
export function formatEditMenuPrompt(options: EditDayOptions, menu: EditMenuEntry[]): string {
  return t("edit.menuPrompt", {
    header: t(`edit.header.${options.state}`, {
      date: options.displayDate,
      absenceLabel: absenceLabelOf(options.record?.recordType),
    }),
    periodsSection:
      options.periods.length > 0
        ? `\n\n${formatWorkPeriodsBlock(options.periods, options.timezone)}`
        : "",
    options: menu.map((entry, i) => `${i + 1}. ${t(entry.labelKey)}`).join("\n"),
  });
}

/**
 * The reply after an edit that changes a date's work periods: its periods
 * (or "No hours logged"), worked total and balance; a half day also shows
 * its credit.
 */
export function formatPeriodsSaved(
  result: EditWorkdayResult,
  title: string,
  timezone: string
): string {
  return t("edit.periodsSaved", {
    title,
    date: result.displayDate,
    absenceLine:
      result.absencePortion === "HALF"
        ? t("edit.periodsSavedAbsenceLine", {
            absenceLabel: absenceLabelOf(result.recordType),
            creditedStr: formatMinutesAsDuration(result.creditedMinutes),
          })
        : "",
    periodsBlock:
      result.periods.length > 0
        ? formatWorkPeriodsBlock(result.periods, timezone)
        : t("edit.noHoursLogged"),
    workedStr: formatMinutesAsDuration(result.workedMinutes),
    balanceStr: formatBalance(result.balanceMinutes),
  });
}
