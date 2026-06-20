import type { Context } from "telegraf";
import { getMonthSummary } from "@/services/SummaryService";
import { formatMinutesAsDuration, formatBalance } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";

export async function handleMonth(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    const summary = await getMonthSummary(telegramId);

    const workedStr = formatMinutesAsDuration(summary.workedMinutes);
    const requiredStr = formatMinutesAsDuration(summary.requiredMinutes);
    const balanceStr = formatBalance(summary.balanceMinutes);
    const balanceEmoji = summary.balanceMinutes >= 0 ? "🟢" : "🔴";

    await ctx.reply(
      [
        "🗓 *Monthly summary*",
        `📆 Month: *${summary.month}*`,
        "",
        `📋 Workdays:  *${summary.workdaysCount}*`,
        `⏱ Required:  *${requiredStr}*`,
        `✅ Worked:    *${workedStr}*`,
        `${balanceEmoji} Balance:   *${balanceStr}*`,
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
