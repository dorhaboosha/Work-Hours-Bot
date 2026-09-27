import type { Context } from "telegraf";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { formatSettingsDisplay } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";

export async function handleSettings(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    const settings = await getSettingsOrThrow(telegramId);
    await ctx.reply(formatSettingsDisplay(settings), { parse_mode: "Markdown" });
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
