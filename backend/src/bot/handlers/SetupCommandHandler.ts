import type { Context } from "telegraf";
import { setupSettings, getSettings, DEFAULT_TIMEZONE, DEFAULT_WORKDAYS } from "@/services/SettingsService";
import { formatMinutesAsDuration } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { AppError } from "@/utils/AppError";
import { t, formatWorkdays } from "@/i18n";
import { LANGUAGE_LABELS } from "@shared/types/CoreTypes";
import type { LanguageCode, Weekday } from "@shared/types/CoreTypes";

const USAGE = [
  "⚙️ *Setup your work schedule*",
  "",
  "Usage: `/setup <daily_hours> [timezone] [workdays] [language]`",
  "",
  "• `daily_hours` — decimal hours (e.g. `8.8`) or integer minutes (e.g. `528`)",
  "• `timezone`   — IANA tz name (e.g. `Asia/Jerusalem`) — default: `Asia/Jerusalem`",
  "• `workdays`   — comma-separated weekday numbers 0=Sun … 6=Sat — default: `0,1,2,3,4`",
  "• `language`   — `en` or `he` — default: `en`",
  "",
  "Examples:",
  "  `/setup 8.8`",
  "  `/setup 8.8 America/New_York`",
  "  `/setup 8.8 Europe/London 1,2,3,4,5`",
  "  `/setup 8.8 Asia/Jerusalem 0,1,2,3,4 he`",
].join("\n");

function parseWorkdays(raw: string): Weekday[] | null {
  const parts = raw.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length === 0) return null;
  if (parts.some((n) => isNaN(n) || n < 0 || n > 6)) return null;
  return parts as Weekday[];
}

export async function handleSetup(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
  const args = text.trim().split(/\s+/).slice(1);

  if (args.length === 0) {
    await ctx.reply(USAGE, { parse_mode: "Markdown" });
    return;
  }

  // --- daily hours ---
  const rawHours = parseFloat(args[0]);
  if (isNaN(rawHours) || rawHours <= 0) {
    await ctx.reply("❌ `daily_hours` must be a positive number.\n\n" + USAGE, {
      parse_mode: "Markdown",
    });
    return;
  }

  const timezone = args[1] ?? DEFAULT_TIMEZONE;

  let workdays: Weekday[] = DEFAULT_WORKDAYS;
  if (args[2] !== undefined) {
    const parsed = parseWorkdays(args[2]);
    if (parsed === null) {
      await ctx.reply(
        "❌ Invalid workdays. Provide comma-separated weekday numbers 0–6 (e.g. `0,1,2,3,4`).",
        { parse_mode: "Markdown" }
      );
      return;
    }
    workdays = parsed;
  }

  const rawLang = args[3] ?? "en";
  const language: LanguageCode = rawLang === "he" ? "he" : "en";

  try {
    const settings = await setupSettings({ telegramId, dailyHoursOrMinutes: rawHours, timezone, workdays, language });
    const lang = settings.language as LanguageCode;
    const dailyHoursStr = formatMinutesAsDuration(settings.dailyRequiredMinutes);
    const workdaysStr = formatWorkdays(settings.workdays as Weekday[], lang);
    const languageLabel = LANGUAGE_LABELS[lang];

    await ctx.reply(
      [
        "✅ *Setup complete!*",
        "",
        t("settings.display", lang, { dailyHoursStr, workdaysStr, timezone: settings.timezone, languageLabel }),
        "",
        "You can now use /start to begin tracking your workday.",
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    if (err instanceof AppError && err.code === "SETUP_ALREADY_COMPLETED") {
      // Show current settings in the user's language instead of a plain error
      const existing = await getSettings(telegramId);
      if (existing) {
        const lang = existing.language as LanguageCode;
        const dailyHoursStr = formatMinutesAsDuration(existing.dailyRequiredMinutes);
        const workdaysStr = formatWorkdays(existing.workdays as Weekday[], lang);
        const languageLabel = LANGUAGE_LABELS[lang];
        await ctx.reply(
          t("setup.alreadyCompleted", lang, { dailyHoursStr, workdaysStr, timezone: existing.timezone, languageLabel }),
          { parse_mode: "Markdown" }
        );
        return;
      }
    }
    await handleBotError(ctx, err);
  }
}
