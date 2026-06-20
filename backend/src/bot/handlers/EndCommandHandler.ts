import type { Context } from "telegraf";
import { endWorkday } from "@/services/WorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import {
  formatTime,
  formatMinutesAsDuration,
  formatBalance,
} from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";

export async function handleEnd(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    const result = await endWorkday(telegramId);
    const settings = await getSettingsOrThrow(telegramId);

    const startStr = formatTime(result.startTime, settings.timezone);
    const endStr = formatTime(result.endTime, settings.timezone);
    const workedStr = formatMinutesAsDuration(result.workedMinutes);
    const requiredStr = formatMinutesAsDuration(result.requiredMinutes);
    const balanceStr = formatBalance(result.balanceMinutes);
    const balanceEmoji = result.balanceMinutes >= 0 ? "🟢" : "🔴";

    await ctx.reply(
      [
        "⏹ *Workday ended!*",
        "",
        `🗓 Date:       *${result.workDate}*`,
        `🕐 Start:      *${startStr}*`,
        `🏁 End:        *${endStr}*`,
        "",
        `✅ Worked:     *${workedStr}*`,
        `📋 Required:   *${requiredStr}*`,
        `${balanceEmoji} Balance:    *${balanceStr}*`,
        "",
        "Use /week or /month to view your summary.",
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
