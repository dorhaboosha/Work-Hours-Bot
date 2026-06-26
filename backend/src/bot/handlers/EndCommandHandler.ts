import type { Context } from "telegraf";
import { endWorkday } from "@/services/WorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { formatTime, formatMinutesAsDuration, formatBalance } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/i18n";

export async function handleEnd(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    const settings = await getSettingsOrThrow(telegramId);
    const result = await endWorkday(telegramId);

    const startStr = formatTime(result.startTime, settings.timezone);
    const endStr = formatTime(result.endTime, settings.timezone);
    const workedStr = formatMinutesAsDuration(result.workedMinutes);
    const requiredStr = formatMinutesAsDuration(result.requiredMinutes);
    const balanceStr = formatBalance(result.balanceMinutes);
    const balanceEmoji = result.balanceMinutes >= 0 ? "🟢" : "🔴";

    await ctx.reply(
      t("end.success", {
        workDate: result.workDate,
        startStr,
        endStr,
        workedStr,
        requiredStr,
        balanceStr,
        balanceEmoji,
      }),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
