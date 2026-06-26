import type { Context } from "telegraf";
import { getTodayStatus } from "@/services/WorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { formatTime, formatMinutesAsDuration, formatBalance } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/i18n";

export async function handleStatus(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    const settings = await getSettingsOrThrow(telegramId);
    const status = await getTodayStatus(telegramId);

    const startStr = formatTime(status.startTime, settings.timezone);
    const endStr = formatTime(status.expectedEndTime, settings.timezone);
    const workedStr = formatMinutesAsDuration(status.workedMinutesSoFar);
    const remainingStr = formatMinutesAsDuration(status.remainingMinutes);
    const requiredStr = formatMinutesAsDuration(settings.dailyRequiredMinutes);
    const balanceStr = formatBalance(status.workedMinutesSoFar - settings.dailyRequiredMinutes);

    const goalReached = status.remainingMinutes === 0;
    const hint = t(goalReached ? "status.hintGoalReached" : "status.hint", "en");

    await ctx.reply(
      t("status.active", "en", {
        workDate: status.workDate,
        startStr,
        endStr,
        workedStr,
        remainingStr,
        requiredStr,
        balanceStr,
        hint,
      }),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
