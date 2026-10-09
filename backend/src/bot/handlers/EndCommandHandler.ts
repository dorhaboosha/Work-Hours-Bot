import type { Context } from "telegraf";
import { endWorkday } from "@/services/WorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import {
  formatTime,
  formatMinutesAsDuration,
  formatBalance,
  formatWorkPeriodsBlock,
} from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/i18n";

export async function handleEnd(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    const settings = await getSettingsOrThrow(telegramId);
    const result = await endWorkday(telegramId, settings);

    // One period → "Workday ended" with Start/End lines; several → the
    // numbered list, titled with the period that was just ended (the last).
    const multiPeriod = result.periods.length > 1;
    const title = multiPeriod
      ? t("end.titlePeriod", { periodNumber: result.periods.length })
      : t("end.titleSingle");
    const periodsBlock = multiPeriod
      ? formatWorkPeriodsBlock(result.periods, settings.timezone)
      : t("end.startEndLines", {
          startStr: formatTime(result.startTime, settings.timezone),
          endStr: formatTime(result.endTime, settings.timezone),
        });
    const workedStr = formatMinutesAsDuration(result.workedMinutes);
    const requiredStr = formatMinutesAsDuration(result.requiredMinutes);
    const balanceStr = formatBalance(result.balanceMinutes);
    const balanceEmoji = result.balanceMinutes >= 0 ? "🟢" : "🔴";
    const creditedLine =
      result.creditedMinutes > 0
        ? t("end.creditedLine", { creditedStr: formatMinutesAsDuration(result.creditedMinutes) })
        : "";

    await ctx.reply(
      t("end.success", {
        title,
        workDate: result.workDate,
        periodsBlock,
        workedStr,
        creditedLine,
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
