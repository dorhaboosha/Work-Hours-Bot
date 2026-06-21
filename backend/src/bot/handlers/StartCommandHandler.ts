import type { Context } from "telegraf";
import { startWorkday } from "@/services/WorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { formatTime, formatMinutesAsDuration } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/i18n";
import type { LanguageCode } from "@shared/types/CoreTypes";

export async function handleStart(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  // Fetch settings first so lang is resolved before any service call can throw.
  let lang: LanguageCode = "en";
  try {
    const settings = await getSettingsOrThrow(telegramId);
    lang = settings.language as LanguageCode;

    const record = await startWorkday(telegramId);

    const startStr = formatTime(record.startTime!, settings.timezone);
    const endStr = formatTime(record.expectedEndTime!, settings.timezone);
    const durationStr = formatMinutesAsDuration(settings.dailyRequiredMinutes);

    await ctx.reply(
      t("start.success", lang, { startStr, endStr, durationStr }),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err, lang);
  }
}
