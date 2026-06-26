import type { Context } from "telegraf";
import { getSettings } from "@/services/SettingsService";
import { formatMinutesAsDuration } from "@/bot/utils/formatMessage";
import { t, formatWorkdays } from "@/i18n";
import type { Weekday } from "@shared/types/CoreTypes";
import { startSetupFlow } from "@/bot/handlers/ConversationHandler";

export async function handleSetup(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const existing = await getSettings(telegramId).catch(() => null);

  if (existing) {
    const dailyHoursStr = formatMinutesAsDuration(existing.dailyRequiredMinutes);
    const workdaysStr = formatWorkdays(existing.workdays as Weekday[], "en");

    await ctx.reply(
      t("setup.alreadyCompleted", "en", {
        dailyHoursStr,
        workdaysStr,
        timezone: existing.timezone,
      }),
      { parse_mode: "Markdown" }
    );
    return;
  }

  await startSetupFlow(ctx, telegramId);
}
