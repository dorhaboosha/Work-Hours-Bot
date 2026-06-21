import type { Context } from "telegraf";
import { getSettings } from "@/services/SettingsService";
import { formatMinutesAsDuration } from "@/bot/utils/formatMessage";
import { t, formatWorkdays } from "@/i18n";
import { LANGUAGE_LABELS } from "@shared/types/CoreTypes";
import type { LanguageCode, Weekday } from "@shared/types/CoreTypes";
import { startSetupFlow } from "@/bot/handlers/ConversationHandler";

export async function handleSetup(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const existing = await getSettings(telegramId).catch(() => null);

  if (existing) {
    // Setup already done — show current settings and guide to /settings_edit
    const lang = existing.language as LanguageCode;
    const dailyHoursStr = formatMinutesAsDuration(existing.dailyRequiredMinutes);
    const workdaysStr = formatWorkdays(existing.workdays as Weekday[], lang);
    const languageLabel = LANGUAGE_LABELS[lang];

    await ctx.reply(
      t("setup.alreadyCompleted", lang, {
        dailyHoursStr,
        workdaysStr,
        timezone: existing.timezone,
        languageLabel,
      }),
      { parse_mode: "Markdown" }
    );
    return;
  }

  // First time — kick off the multi-step setup conversation
  await startSetupFlow(ctx, telegramId);
}
