import type { Context } from "telegraf";
import { getMonthSummary } from "@/services/SummaryService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { formatMinutesAsDuration, formatBalance } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/i18n";
import type { LanguageCode } from "@shared/types/CoreTypes";

export async function handleMonth(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  let lang: LanguageCode = "en";
  try {
    const [summary, settings] = await Promise.all([
      getMonthSummary(telegramId),
      getSettingsOrThrow(telegramId),
    ]);
    lang = settings.language as LanguageCode;

    const workedStr = formatMinutesAsDuration(summary.workedMinutes);
    const requiredStr = formatMinutesAsDuration(summary.requiredMinutes);
    const balanceStr = formatBalance(summary.balanceMinutes);
    const balanceEmoji = summary.balanceMinutes >= 0 ? "🟢" : "🔴";

    await ctx.reply(
      t("month.summary", lang, {
        month: summary.month!,
        workdaysCount: summary.workdaysCount,
        requiredStr,
        workedStr,
        balanceStr,
        balanceEmoji,
      }),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err, lang);
  }
}
