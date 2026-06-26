import type { Context } from "telegraf";
import { getEditDayOptions } from "@/services/EditWorkdayService";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/i18n";
import { startEditFlow } from "@/bot/handlers/ConversationHandler";
import type { AbsenceRecordType, DailyRecordType } from "@shared/types/CoreTypes";
import { isAbsenceRecordType } from "@shared/utils/recordTypeUtils";

/** Matches dd-mm format */
const DD_MM_RE = /^\d{2}-\d{2}$/;

export async function handleEdit(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
  const args = text.trim().split(/\s+/).slice(1);

  try {
    if (args.length === 0 || !DD_MM_RE.test(args[0])) {
      await ctx.reply("Usage: `/edit dd-mm` (e.g. `/edit 12-06`)", { parse_mode: "Markdown" });
      return;
    }

    const ddMm = args[0];
    const options = await getEditDayOptions(telegramId, ddMm);

    let prompt: string;
    switch (options.state) {
      case "OPEN_WORK_RECORD":
        prompt = t("edit.openRecord", { date: ddMm });
        break;
      case "NO_RECORD":
        prompt = t("edit.noRecord", { date: ddMm });
        break;
      case "CLOSED_WORK_RECORD":
        prompt = t("edit.closedRecord", { date: ddMm });
        break;
      case "ABSENCE_RECORD": {
        const recType = options.record?.recordType as DailyRecordType | undefined;
        const absenceLabel =
          recType && isAbsenceRecordType(recType)
            ? t(`absenceType.${recType as AbsenceRecordType}`)
            : recType ?? "absence";
        prompt = t("edit.absenceRecord", { date: ddMm, absenceLabel });
        break;
      }
    }

    await startEditFlow(ctx, telegramId, ddMm, options.state, prompt);
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
