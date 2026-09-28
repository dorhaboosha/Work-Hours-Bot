import type { Context } from "telegraf";
import { startWorkday } from "@/services/WorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { formatTime, formatMinutesAsDuration } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/i18n";
import { isAbsenceRecordType } from "@shared/utils/recordTypeUtils";
import { minutesBetween } from "@/utils/DateUtils";

export async function handleStart(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    const settings = await getSettingsOrThrow(telegramId);
    const record = await startWorkday(telegramId, settings);

    const startStr = formatTime(record.startTime!, settings.timezone);
    const endStr = formatTime(record.expectedEndTime!, settings.timezone);
    // Session length as startWorkday computed it (today's required minus any credit).
    const durationStr = formatMinutesAsDuration(
      minutesBetween(record.startTime!, record.expectedEndTime!)
    );

    // Session started on a half-day absence (e.g. ½ vacation, holiday eve).
    const message = isAbsenceRecordType(record.recordType)
      ? t("start.successHalfDay", {
          absenceLabel: t(`absenceType.${record.recordType}`),
          creditedStr: formatMinutesAsDuration(record.creditedMinutes),
          startStr,
          endStr,
          durationStr,
        })
      : t("start.success", { startStr, endStr, durationStr });

    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
