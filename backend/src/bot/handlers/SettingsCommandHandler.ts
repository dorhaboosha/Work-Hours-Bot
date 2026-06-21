import type { Context } from "telegraf";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { formatMinutesAsDuration } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t, formatWorkdays } from "@/i18n";
import { LANGUAGE_LABELS } from "@shared/types/CoreTypes";
import type { LanguageCode, Weekday } from "@shared/types/CoreTypes";

export async function handleSettings(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  let lang: LanguageCode = "en";
  try {
    const settings = await getSettingsOrThrow(telegramId);
    lang = settings.language as LanguageCode;

    const dailyHoursStr = formatMinutesAsDuration(settings.dailyRequiredMinutes);
    const workdaysStr = formatWorkdays(settings.workdays as Weekday[], lang);
    const languageLabel = LANGUAGE_LABELS[lang];

    await ctx.reply(
      t("settings.display", lang, { dailyHoursStr, workdaysStr, timezone: settings.timezone, languageLabel }),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err, lang);
  }
}
