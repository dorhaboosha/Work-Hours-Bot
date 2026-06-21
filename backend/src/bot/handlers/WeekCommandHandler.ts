import type { Context } from "telegraf";
import { getWeekSummary } from "@/services/SummaryService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { formatMinutesAsDuration, formatBalance } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/localization/LocalizationService";
import type { LanguageCode } from "@shared/types/CoreTypes";

export async function handleWeek(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  let lang: LanguageCode = "en";
  try {
    const [summary, settings] = await Promise.all([
      getWeekSummary(telegramId),
      getSettingsOrThrow(telegramId),
    ]);
    lang = settings.language as LanguageCode;

    const workedStr = formatMinutesAsDuration(summary.workedMinutes);
    const requiredStr = formatMinutesAsDuration(summary.requiredMinutes);
    const balanceStr = formatBalance(summary.balanceMinutes);

    await ctx.reply(
      t(lang).weekSummary({
        startDate: summary.startDate!,
        endDate: summary.endDate!,
        workdaysCount: summary.workdaysCount,
        requiredStr,
        workedStr,
        balanceStr,
        balancePositive: summary.balanceMinutes >= 0,
      }),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err, lang);
  }
}
