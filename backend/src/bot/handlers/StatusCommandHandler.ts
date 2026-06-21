import type { Context } from "telegraf";
import { getTodayStatus } from "@/services/WorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { formatTime, formatMinutesAsDuration, formatBalance } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/i18n";
import type { LanguageCode } from "@shared/types/CoreTypes";

export async function handleStatus(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  // Fetch settings first so lang is resolved before any service call can throw.
  let lang: LanguageCode = "en";
  try {
    const settings = await getSettingsOrThrow(telegramId);
    lang = settings.language as LanguageCode;

    const status = await getTodayStatus(telegramId);

    const startStr = formatTime(status.startTime, settings.timezone);
    const endStr = formatTime(status.expectedEndTime, settings.timezone);
    const workedStr = formatMinutesAsDuration(status.workedMinutesSoFar);
    const remainingStr = formatMinutesAsDuration(status.remainingMinutes);
    const requiredStr = formatMinutesAsDuration(settings.dailyRequiredMinutes);
    const balanceStr = formatBalance(status.workedMinutesSoFar - settings.dailyRequiredMinutes);

    const goalReached = status.remainingMinutes === 0;
    const hint = t(goalReached ? "status.hintGoalReached" : "status.hint", lang);

    await ctx.reply(
      t("status.active", lang, {
        workDate: status.workDate,
        startStr,
        endStr,
        workedStr,
        remainingStr,
        requiredStr,
        balanceStr,
        hint,
      }),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err, lang);
  }
}
