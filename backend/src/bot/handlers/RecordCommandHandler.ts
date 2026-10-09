import type { Context } from "telegraf";
import { getDateRecord } from "@/services/WorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { getLocalDate } from "@/utils/DateUtils";
import { handleBotError } from "@/bot/utils/handleBotError";
import { formatRecordMessage } from "@/bot/utils/formatRecordMessage";
import { getCommandArgs } from "@/bot/utils/messageText";
import { t } from "@/i18n";
import { DD_MM_RE } from "@/constants/timeFormats";

export async function handleRecord(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const args = getCommandArgs(ctx);

  try {
    if (args.length > 1) {
      await ctx.reply(t("record.usageHint"), { parse_mode: "Markdown" }).catch(() => undefined);
      return;
    }
    if (args.length === 1 && !DD_MM_RE.test(args[0])) {
      await ctx.reply(t("record.usageHint"), { parse_mode: "Markdown" }).catch(() => undefined);
      return;
    }

    const settings = await getSettingsOrThrow(telegramId);

    let ddMm: string;
    if (args.length === 0) {
      const today = getLocalDate(settings.timezone); // YYYY-MM-DD
      const [, mm, dd] = today.split("-");
      ddMm = `${dd}-${mm}`;
    } else {
      ddMm = args[0];
    }

    const lookup = await getDateRecord(telegramId, ddMm, settings);

    await ctx
      .reply(formatRecordMessage(lookup, ddMm), { parse_mode: "Markdown" })
      .catch(() => undefined);
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
