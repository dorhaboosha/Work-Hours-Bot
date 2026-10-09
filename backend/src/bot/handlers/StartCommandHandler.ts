import type { Context } from "telegraf";
import { startWorkday } from "@/services/WorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import {
  formatTime,
  formatMinutesAsDuration,
  formatWorkPeriodsList,
} from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/i18n";
import { isAbsenceRecordType } from "@shared/utils/recordTypeUtils";
import { minutesBetween } from "@/utils/DateUtils";

export async function handleStart(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    const settings = await getSettingsOrThrow(telegramId);
    const { record, periods, workedMinutesSoFar } = await startWorkday(telegramId, settings);

    // The period just opened is always the last one.
    const periodStart = new Date(periods[periods.length - 1].startTime);
    const startStr = formatTime(periodStart, settings.timezone);
    const endStr = formatTime(record.expectedEndTime!, settings.timezone);
    // Time left to work as startWorkday computed it (today's required minus
    // any credit and any earlier periods).
    const durationStr = formatMinutesAsDuration(
      minutesBetween(periodStart, record.expectedEndTime!)
    );

    let message: string;
    if (periods.length > 1) {
      message = t("start.successNextPeriod", {
        periodNumber: periods.length,
        periodsList: formatWorkPeriodsList(periods, settings.timezone),
        workedStr: formatMinutesAsDuration(workedMinutesSoFar),
        creditedLine:
          record.creditedMinutes > 0
            ? t("start.creditedLine", {
                creditedStr: formatMinutesAsDuration(record.creditedMinutes),
              })
            : "",
        durationStr,
        endStr,
      });
    } else if (isAbsenceRecordType(record.recordType)) {
      // Session started on a half-day absence (e.g. ½ vacation, holiday eve).
      message = t("start.successHalfDay", {
        absenceLabel: t(`absenceType.${record.recordType}`),
        creditedStr: formatMinutesAsDuration(record.creditedMinutes),
        startStr,
        endStr,
        durationStr,
      });
    } else {
      message = t("start.success", { startStr, endStr, durationStr });
    }

    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
