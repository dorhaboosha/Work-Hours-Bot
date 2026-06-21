import type { Context } from "telegraf";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { handleBotError } from "@/bot/utils/handleBotError";
import type { LanguageCode } from "@shared/types/CoreTypes";
import { startSettingsEditFlow } from "@/bot/handlers/ConversationHandler";

export async function handleSettingsEdit(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  let lang: LanguageCode = "en";
  try {
    const settings = await getSettingsOrThrow(telegramId);
    lang = settings.language as LanguageCode;
    await startSettingsEditFlow(ctx, telegramId, lang);
  } catch (err) {
    await handleBotError(ctx, err, lang);
  }
}
