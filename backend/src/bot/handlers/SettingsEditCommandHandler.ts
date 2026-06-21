import type { Context } from "telegraf";
import { getSettingsOrThrow, updateSettings } from "@/services/SettingsService";
import { formatMinutesAsDuration } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t, formatWorkdays } from "@/i18n";
import { LANGUAGE_LABELS } from "@shared/types/CoreTypes";
import { decimalHoursToMinutes } from "@shared/utils/timeUtils";
import type { LanguageCode, Weekday } from "@shared/types/CoreTypes";

/**
 * Temporary single-command format for /settings_edit (multi-step flow is task 8.3).
 *
 * Usage:
 *   /settings_edit hours <decimal_hours>      e.g. /settings_edit hours 8.8
 *   /settings_edit timezone <IANA_tz>         e.g. /settings_edit timezone Europe/Berlin
 *   /settings_edit workdays <0,1,2,3,4>       e.g. /settings_edit workdays 1,2,3,4,5
 *   /settings_edit language <en|he>           e.g. /settings_edit language he
 */

function parseWorkdays(raw: string): Weekday[] | null {
  const parts = raw.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length === 0) return null;
  if (parts.some((n) => isNaN(n) || n < 0 || n > 6)) return null;
  return parts as Weekday[];
}

function usageMessage(lang: LanguageCode): string {
  if (lang === "he") {
    return [
      "⚙️ *עריכת הגדרות*",
      "",
      "שימוש: `/settings_edit <שדה> <ערך>`",
      "",
      "שדות:",
      "  `hours <שעות>` — למשל `/settings_edit hours 8.8`",
      "  `timezone <אזור>` — למשל `/settings_edit timezone Asia/Jerusalem`",
      "  `workdays <0,1,2,3,4>` — למשל `/settings_edit workdays 0,1,2,3,4`",
      "  `language <en|he>` — למשל `/settings_edit language he`",
    ].join("\n");
  }
  return [
    "⚙️ *Edit your settings*",
    "",
    "Usage: `/settings_edit <field> <value>`",
    "",
    "Fields:",
    "  `hours <decimal_hours>` — e.g. `/settings_edit hours 8.8`",
    "  `timezone <IANA_tz>`   — e.g. `/settings_edit timezone Europe/Berlin`",
    "  `workdays <0,1,...>`   — e.g. `/settings_edit workdays 1,2,3,4,5`",
    "  `language <en|he>`     — e.g. `/settings_edit language he`",
  ].join("\n");
}

export async function handleSettingsEdit(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  let lang: LanguageCode = "en";
  try {
    const current = await getSettingsOrThrow(telegramId);
    lang = current.language as LanguageCode;

    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
    const args = text.trim().split(/\s+/).slice(1);

    if (args.length < 2) {
      await ctx.reply(usageMessage(lang), { parse_mode: "Markdown" });
      return;
    }

    const [field, ...rest] = args;
    const value = rest.join(" ");

    let updated;
    switch (field.toLowerCase()) {
      case "hours": {
        const hours = parseFloat(value);
        if (isNaN(hours) || hours <= 0) {
          await ctx.reply("❌ `hours` must be a positive number.", { parse_mode: "Markdown" });
          return;
        }
        const mins = hours >= 60 ? Math.round(hours) : decimalHoursToMinutes(hours);
        updated = await updateSettings(telegramId, { dailyRequiredMinutes: mins });
        break;
      }
      case "timezone": {
        updated = await updateSettings(telegramId, { timezone: value });
        break;
      }
      case "workdays": {
        const days = parseWorkdays(value);
        if (days === null) {
          await ctx.reply(
            "❌ Invalid workdays. Use comma-separated numbers 0–6 (e.g. `0,1,2,3,4`).",
            { parse_mode: "Markdown" }
          );
          return;
        }
        updated = await updateSettings(telegramId, { workdays: days });
        break;
      }
      case "language": {
        const newLang: LanguageCode = value === "he" ? "he" : "en";
        updated = await updateSettings(telegramId, { language: newLang });
        break;
      }
      default:
        await ctx.reply(usageMessage(lang), { parse_mode: "Markdown" });
        return;
    }

    const newLang = updated.language as LanguageCode;
    const dailyHoursStr = formatMinutesAsDuration(updated.dailyRequiredMinutes);
    const workdaysStr = formatWorkdays(updated.workdays as Weekday[], newLang);
    const languageLabel = LANGUAGE_LABELS[newLang];

    await ctx.reply(
      [
        "✅ *Settings updated.*",
        "",
        t("settings.display", newLang, { dailyHoursStr, workdaysStr, timezone: updated.timezone, languageLabel }),
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err, lang);
  }
}
