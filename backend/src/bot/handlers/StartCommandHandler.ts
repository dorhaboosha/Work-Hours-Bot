import type { Context } from "telegraf";
import { startWorkday } from "@/services/WorkdayService";
import { formatTime, formatMinutesAsDuration } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { getSettingsOrThrow } from "@/services/SettingsService";

export async function handleStart(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    const [record, settings] = await Promise.all([
      startWorkday(telegramId),
      getSettingsOrThrow(telegramId),
    ]);

    const startStr = formatTime(record.startTime, settings.timezone);
    const endStr = formatTime(record.expectedEndTime, settings.timezone);
    const durationStr = formatMinutesAsDuration(settings.dailyRequiredMinutes);

    await ctx.reply(
      [
        "▶️ *Workday started!*",
        "",
        `🕐 Start time:    *${startStr}*`,
        `🏁 Expected end:  *${endStr}*`,
        `⏱ Required:       *${durationStr}*`,
        "",
        "Use /status to check your progress, or /end when you're done.",
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
