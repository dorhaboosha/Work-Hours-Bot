import type { DateRecordLookup } from "@shared/types/ViewTypes";
import type { AbsenceRecordType } from "@shared/types/CoreTypes";
import { isAbsenceRecordType } from "@shared/utils/recordTypeUtils";
import {
  formatTime,
  formatMinutesAsDuration,
  formatWorkPeriodsBlock,
} from "@/bot/utils/formatMessage";
import { t } from "@/i18n";

/**
 * Builds the /record reply for a looked-up date (`ddMm` is the date as the
 * user typed it, e.g. "12-06").
 *
 * A day with several periods lists them all, then a blank line and the
 * worked total (an open period counted up to now). A day with one period
 * keeps the Start/End layout.
 */
export function formatRecordMessage(lookup: DateRecordLookup, ddMm: string): string {
  const { timezone, periods } = lookup;
  const multiPeriod = periods.length > 1;
  const periodsBlock = multiPeriod ? formatWorkPeriodsBlock(periods, timezone) : "";
  const periodsWorkedStr = formatMinutesAsDuration(
    periods.reduce((total, p) => total + p.workedMinutes, 0)
  );

  switch (lookup.state) {
    case "COMPLETED_WORK_RECORD": {
      if (multiPeriod) {
        return t("record.completedWorkPeriods", {
          date: ddMm,
          periodsBlock,
          workedStr: periodsWorkedStr,
        });
      }
      const startStr = formatTime(lookup.record.startTime!, timezone);
      const endStr = formatTime(lookup.record.endTime!, timezone);
      const workedStr = formatMinutesAsDuration(lookup.record.workedMinutes!);
      return t("record.completedWork", { date: ddMm, startStr, endStr, workedStr });
    }
    case "OPEN_WORK_RECORD": {
      if (multiPeriod) {
        return t("record.openWorkPeriods", {
          date: ddMm,
          periodsBlock,
          workedStr: periodsWorkedStr,
        });
      }
      const startStr = formatTime(lookup.record.startTime!, timezone);
      return t("record.openWork", { date: ddMm, startStr });
    }
    case "ABSENCE_RECORD": {
      const { record } = lookup;
      const recType = record.recordType;
      const absenceLabel = isAbsenceRecordType(recType)
        ? t(`absenceType.${recType as AbsenceRecordType}`)
        : recType;

      if (record.absencePortion !== "HALF") {
        return t("record.absence", { date: ddMm, absenceLabel });
      }

      // Half day: show its credit and whatever hours were logged on it.
      let hoursLine: string;
      if (multiPeriod) {
        hoursLine = t("record.halfDayPeriods", { periodsBlock, workedStr: periodsWorkedStr });
      } else if (!record.startTime) {
        hoursLine = t("record.halfDayNoHours");
      } else if (!record.endTime) {
        hoursLine = t("record.halfDayOpen", { startStr: formatTime(record.startTime, timezone) });
      } else {
        hoursLine = t("record.halfDayHours", {
          startStr: formatTime(record.startTime, timezone),
          endStr: formatTime(record.endTime, timezone),
          workedStr: formatMinutesAsDuration(record.workedMinutes ?? 0),
        });
      }
      return t("record.halfDay", {
        date: ddMm,
        absenceLabel,
        creditedStr: formatMinutesAsDuration(record.creditedMinutes ?? 0),
        hoursLine,
      });
    }
    case "NO_RECORD":
      return t("record.noRecord", { date: ddMm });
  }
}
