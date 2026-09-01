import type { Context } from "telegraf";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { formatMinutesAsDuration, formatDecimalDays } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t, formatWorkdays } from "@/i18n";
import type { Weekday } from "@shared/types/CoreTypes";

export async function handleSettings(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    const settings = await getSettingsOrThrow(telegramId);
    const dailyHoursStr = formatMinutesAsDuration(settings.dailyRequiredMinutes);
    const workdaysStr = formatWorkdays(settings.workdays as Weekday[]);
    const vacationRateStr = formatDecimalDays(settings.vacationAccrualRate);
    const sickRateStr = formatDecimalDays(settings.sickAccrualRate);

    await ctx.reply(
      t("settings.display", {
        dailyHoursStr,
        workdaysStr,
        timezone: settings.timezone,
        vacationRateStr,
        sickRateStr,
      }),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
