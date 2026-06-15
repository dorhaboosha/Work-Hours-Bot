import type { Context } from "telegraf";
import { getMonthSummary } from "@/services/SummaryService";
import { formatMinutesAsDuration, formatBalance } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";

/** Matches an optional YYYY-MM reference month argument. */
const MONTH_RE = /^\d{4}-\d{2}$/;

export async function handleMonth(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
  const args = text.trim().split(/\s+/).slice(1);

  let referenceMonth: string | undefined;
  if (args.length > 0) {
    if (!MONTH_RE.test(args[0])) {
      await ctx.reply(
        "❌ Invalid month format. Use *YYYY-MM* (e.g. `/month 2026-06`).",
        { parse_mode: "Markdown" }
      );
      return;
    }
    referenceMonth = args[0];
  }

  try {
    const summary = await getMonthSummary(telegramId, referenceMonth);

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
