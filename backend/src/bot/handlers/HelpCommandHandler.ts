import type { Context } from "telegraf";
import { getSettings } from "@/services/SettingsService";
import { t } from "@/localization/LocalizationService";
import type { LanguageCode } from "@shared/types/CoreTypes";

export async function handleHelp(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  // Resolve language from settings if available; fall back to English gracefully.
  let lang: LanguageCode = "en";
  const settings = await getSettings(telegramId).catch(() => null);
  if (settings) {
    lang = settings.language as LanguageCode;
  }

  await ctx.reply(t(lang).help, { parse_mode: "Markdown" });
}
