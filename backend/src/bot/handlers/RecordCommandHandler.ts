import type { Context } from "telegraf";
import { getDateRecord } from "@/services/WorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { getLocalDate } from "@/utils/DateUtils";
import { handleBotError } from "@/bot/utils/handleBotError";
import { formatTime, formatMinutesAsDuration } from "@/bot/utils/formatMessage";
import { t } from "@/i18n";
import { DD_MM_RE } from "@/constants/timeFormats";
import type { AbsenceRecordType } from "@shared/types/CoreTypes";
import { isAbsenceRecordType } from "@shared/utils/recordTypeUtils";

export async function handleRecord(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
  const args = text.trim().split(/\s+/).slice(1);

  try {
    if (args.length > 1) {
      await ctx.reply(t("record.usageHint"), { parse_mode: "Markdown" }).catch(() => undefined);
      return;
    }

    let ddMm: string;

    if (args.length === 0) {
      const settings = await getSettingsOrThrow(telegramId);
      const today = getLocalDate(settings.timezone); // YYYY-MM-DD
      const [yyyy, mm, dd] = today.split("-");
      void yyyy;
      ddMm = `${dd}-${mm}`;
    } else if (!DD_MM_RE.test(args[0])) {
      await ctx.reply(t("record.usageHint"), { parse_mode: "Markdown" }).catch(() => undefined);
      return;
    } else {
      ddMm = args[0];
    }
    const lookup = await getDateRecord(telegramId, ddMm);
    const { timezone } = lookup;

    let msg: string;

    switch (lookup.state) {
      case "COMPLETED_WORK_RECORD": {
        const startStr = formatTime(lookup.record.startTime!, timezone);
        const endStr = formatTime(lookup.record.endTime!, timezone);
        const workedStr = formatMinutesAsDuration(lookup.record.workedMinutes!);
        msg = t("record.completedWork", { date: ddMm, startStr, endStr, workedStr });
        break;
      }
      case "OPEN_WORK_RECORD": {
        const startStr = formatTime(lookup.record.startTime!, timezone);
        msg = t("record.openWork", { date: ddMm, startStr });
        break;
      }
      case "ABSENCE_RECORD": {
        const recType = lookup.record.recordType;
        const absenceLabel = isAbsenceRecordType(recType)
          ? t(`absenceType.${recType as AbsenceRecordType}`)
          : recType;
        msg = t("record.absence", { date: ddMm, absenceLabel });
        break;
      }
      case "NO_RECORD":
        msg = t("record.noRecord", { date: ddMm });
        break;
    }

    await ctx.reply(msg, { parse_mode: "Markdown" }).catch(() => undefined);
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
