import type { Context } from "telegraf";
import { endWorkday } from "@/services/WorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import {
  formatTime,
  formatMinutesAsDuration,
  formatBalance,
} from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";

/** Matches a valid 24-hour HH:mm token, e.g. "17:30" or "09:05". */
const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function handleEnd(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  // Extract text after the /end command
  const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
  const args = text.trim().split(/\s+/).slice(1); // drop "/end"

  // Parse optional HH:mm argument
  let manualEndTime: string | undefined;
  if (args.length > 0) {
    const candidate = args[0];
    if (!HH_MM_RE.test(candidate)) {
      await ctx.reply(
        "❌ Invalid time format. Use 24-hour *HH:mm* (e.g. `/end 17:30`).",
        { parse_mode: "Markdown" }
      );
      return;
    }
    manualEndTime = candidate;
  }

  try {
    const result = await endWorkday(telegramId, manualEndTime);
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
