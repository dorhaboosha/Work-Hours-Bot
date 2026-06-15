import type { Context } from "telegraf";
import { DateTime } from "luxon";
import { getWeekSummary } from "@/services/SummaryService";
import { formatMinutesAsDuration, formatBalance } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";

/** Matches YYYY-MM-DD format (calendar validity checked separately via Luxon). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function handleWeek(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
  const args = text.trim().split(/\s+/).slice(1);

  let referenceDate: string | undefined;
  if (args.length > 0) {
    if (!DATE_RE.test(args[0]) || !DateTime.fromISO(args[0]).isValid) {
      await ctx.reply(
        "❌ Invalid date. Use a real calendar date in *YYYY-MM-DD* format (e.g. `/week 2026-06-10`).",
        { parse_mode: "Markdown" }
      );
      return;
    }
    referenceDate = args[0];
  }

  try {
    const summary = await getWeekSummary(telegramId, referenceDate);

    const workedStr = formatMinutesAsDuration(summary.workedMinutes);
    const requiredStr = formatMinutesAsDuration(summary.requiredMinutes);
    const balanceStr = formatBalance(summary.balanceMinutes);
    const balanceEmoji = summary.balanceMinutes >= 0 ? "🟢" : "🔴";

    await ctx.reply(
      [
        "📅 *Weekly summary*",
        `📆 Period: *${summary.startDate}* → *${summary.endDate}*`,
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
