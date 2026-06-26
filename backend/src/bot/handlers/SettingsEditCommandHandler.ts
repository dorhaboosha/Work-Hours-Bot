import type { Context } from "telegraf";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { handleBotError } from "@/bot/utils/handleBotError";
import { startSettingsEditFlow } from "@/bot/handlers/ConversationHandler";

export async function handleSettingsEdit(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    await getSettingsOrThrow(telegramId);
    await startSettingsEditFlow(ctx, telegramId);
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
