import type { Context } from "telegraf";
import { getEditDayOptions } from "@/services/EditWorkdayService";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/localization/LocalizationService";
import type { LanguageCode, AbsenceRecordType, DailyRecordType } from "@shared/types/CoreTypes";
import { isAbsenceRecordType } from "@shared/utils/recordTypeUtils";

/** Matches dd-mm format */
const DD_MM_RE = /^\d{2}-\d{2}$/;

export async function handleEdit(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
  const args = text.trim().split(/\s+/).slice(1);

  let lang: LanguageCode = "en";
  try {
    const settings = await getSettingsOrThrow(telegramId);
    lang = settings.language as LanguageCode;

    if (args.length === 0 || !DD_MM_RE.test(args[0])) {
      const hint = lang === "he"
        ? "שימוש: `/edit dd-mm` (לדוגמה `/edit 12-06`)"
        : "Usage: `/edit dd-mm` (e.g. `/edit 12-06`)";
      await ctx.reply(hint, { parse_mode: "Markdown" });
      return;
    }

    const ddMm = args[0];
    const options = await getEditDayOptions(telegramId, ddMm);
    const catalog = t(lang);

    let prompt: string;
    switch (options.state) {
      case "OPEN_WORK_RECORD":
        prompt = catalog.editDayOpenRecord({ date: ddMm });
        break;
      case "NO_RECORD":
        prompt = catalog.editDayNoRecord({ date: ddMm });
        break;
      case "CLOSED_WORK_RECORD":
        prompt = catalog.editDayClosedRecord({ date: ddMm });
        break;
      case "ABSENCE_RECORD": {
        const recType = options.record?.recordType as DailyRecordType | undefined;
        const absenceLabel =
          recType && isAbsenceRecordType(recType)
            ? catalog.absenceTypeNames[recType as AbsenceRecordType]
            : recType ?? "absence";
        prompt = catalog.editDayAbsenceRecord({ date: ddMm, absenceLabel });
        break;
      }
    }

    // TODO(task 8.3): capture the user's reply and dispatch the chosen action.
    await ctx.reply(prompt, { parse_mode: "Markdown" });
  } catch (err) {
    await handleBotError(ctx, err, lang);
  }
}
