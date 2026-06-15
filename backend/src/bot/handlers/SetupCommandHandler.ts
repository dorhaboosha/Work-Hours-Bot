import type { Context } from "telegraf";
import { setupSettings, DEFAULT_TIMEZONE, DEFAULT_WORKDAYS } from "@/services/SettingsService";
import { formatMinutesAsDuration } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { WEEKDAY_LABELS } from "@shared/types/CoreTypes";
import type { Weekday } from "@shared/types/CoreTypes";

const USAGE = [
  "⚙️ *Setup your work schedule*",
  "",
  "Usage: `/setup <daily_hours> [timezone] [workdays]`",
  "",
  "• `daily_hours` — decimal hours (e.g. `8.8`) or integer minutes (e.g. `528`)",
  "• `timezone`   — IANA tz name (e.g. `Asia/Jerusalem`) — default: `Asia/Jerusalem`",
  "• `workdays`   — comma-separated weekday numbers 0=Sun … 6=Sat — default: `0,1,2,3,4`",
  "",
  "Examples:",
  "  `/setup 8.8`",
  "  `/setup 8.8 America/New_York`",
  "  `/setup 8.8 Europe/London 1,2,3,4,5`",
].join("\n");

/**
 * Parses the workdays CSV argument (e.g. "0,1,2,3,4") into a Weekday array.
 * Returns null if any value is outside 0–6 or if the list is empty.
 */
function parseWorkdays(raw: string): Weekday[] | null {
  const parts = raw.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length === 0) return null;
  if (parts.some((n) => isNaN(n) || n < 0 || n > 6)) return null;
  return parts as Weekday[];
}

export async function handleSetup(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  // Extract text after the /setup command
  const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
  const args = text.trim().split(/\s+/).slice(1); // drop "/setup"

  if (args.length === 0) {
    await ctx.reply(USAGE, { parse_mode: "Markdown" });
    return;
  }

  // --- hours ---
  const rawHours = parseFloat(args[0]);
  if (isNaN(rawHours) || rawHours <= 0) {
    await ctx.reply("❌ `daily_hours` must be a positive number.\n\n" + USAGE, {
      parse_mode: "Markdown",
    });
    return;
  }

  // --- timezone (optional) ---
  const timezone = args[1] ?? DEFAULT_TIMEZONE;

  // --- workdays (optional) ---
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

  try {
    const settings = await setupSettings({
      telegramId,
      dailyHoursOrMinutes: rawHours,
      timezone,
      workdays,
    });

    const dayNames = (settings.workdays as Weekday[])
      .map((d) => WEEKDAY_LABELS[d])
      .join(", ");
    const durationStr = formatMinutesAsDuration(settings.dailyRequiredMinutes);

    await ctx.reply(
      [
        "✅ *Settings saved!*",
        "",
        `🕐 Daily hours: *${durationStr}* (${settings.dailyRequiredMinutes} min)`,
        `🌍 Timezone:    *${settings.timezone}*`,
        `📅 Workdays:    *${dayNames}*`,
        "",
        "You can now use /start to begin tracking your workday.",
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
