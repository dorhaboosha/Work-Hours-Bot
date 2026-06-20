import type { Context } from "telegraf";
import { getTodayStatus } from "@/services/WorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import {
  formatTime,
  formatMinutesAsDuration,
  formatBalance,
} from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";

export async function handleStatus(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    const [status, settings] = await Promise.all([
      getTodayStatus(telegramId),
      getSettingsOrThrow(telegramId),
    ]);

    const startStr = formatTime(status.startTime, settings.timezone);
    const endStr = formatTime(status.expectedEndTime, settings.timezone);
    const workedStr = formatMinutesAsDuration(status.workedMinutesSoFar);
    const remainingStr = formatMinutesAsDuration(status.remainingMinutes);
    const requiredStr = formatMinutesAsDuration(settings.dailyRequiredMinutes);
    const balanceStr = formatBalance(
      status.workedMinutesSoFar - settings.dailyRequiredMinutes
    );

    const lines = [
      "📊 *Today's status*",
      "",
      `🗓 Date:         *${status.workDate}*`,
      `🕐 Start:        *${startStr}*`,
      `🏁 Expected end: *${endStr}*`,
      "",
      `✅ Worked:       *${workedStr}* / ${requiredStr}`,
      `⏳ Remaining:    *${remainingStr}*`,
      `⚖️ Balance:      *${balanceStr}*`,
    ];

    if (status.remainingMinutes === 0) {
      lines.push("", "🎉 You've reached your daily goal! Use /end when you're done, or /edit dd-mm to fix a past date.");
    } else {
      lines.push("", "Use /end to close your workday when you're done, or /edit dd-mm to fix a past date.");
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
