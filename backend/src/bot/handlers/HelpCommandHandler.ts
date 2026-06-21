import type { Context } from "telegraf";
import { resolveUserLang } from "@/services/SettingsService";
import { t } from "@/i18n";

export async function handleHelp(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const lang = await resolveUserLang(telegramId);
  await ctx.reply(t("help", lang), { parse_mode: "Markdown" });
}
