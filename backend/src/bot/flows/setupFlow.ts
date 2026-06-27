import type { Context } from "telegraf";
import { SessionStore } from "@/bot/session/SessionStore";
import type { Session } from "@/bot/session/SessionStore";
import { setupSettings } from "@/services/SettingsService";
import { formatMinutesAsDuration } from "@/bot/utils/formatMessage";
import { t, formatWorkdays } from "@/i18n";
import { handleBotError } from "@/bot/utils/handleBotError";
import type { Weekday } from "@shared/types/CoreTypes";
import { PREDEFINED_TIMEZONES } from "@/constants/timezones";
import { parseWorkdayList } from "@/bot/utils/timeInputParser";

export async function handleSetupStep(
  ctx: Context,
  userId: string,
  text: string,
  session: Session
): Promise<void> {
  switch (session.step) {
    case "setup:hours": {
      const hours = parseFloat(text);
      if (isNaN(hours) || hours <= 0) {
        await ctx.reply(t("setup.invalidHours"), { parse_mode: "Markdown" });
        return;
      }
      SessionStore.set(userId, { step: "setup:workdays", data: { hours } });
      await ctx.reply(t("setup.chooseWorkdays"), { parse_mode: "Markdown" });
      break;
    }

    case "setup:workdays": {
      if (text === "1") {
        SessionStore.set(userId, { step: "setup:timezone", data: { ...session.data, workdays: [0,1,2,3,4] } });
        await ctx.reply(t("setup.chooseTimezone"), { parse_mode: "Markdown" });
      } else if (text === "2") {
        SessionStore.set(userId, { step: "setup:timezone", data: { ...session.data, workdays: [1,2,3,4,5] } });
        await ctx.reply(t("setup.chooseTimezone"), { parse_mode: "Markdown" });
      } else if (text === "3") {
        SessionStore.set(userId, { step: "setup:workdays_custom", data: session.data });
        await ctx.reply(t("setup.askCustomWorkdays"), { parse_mode: "Markdown" });
      } else {
        await ctx.reply(t("setup.invalidWorkdayChoice"), { parse_mode: "Markdown" });
      }
      break;
    }

    case "setup:workdays_custom": {
      const workdays = parseWorkdayList(text);
      if (workdays === null) {
        await ctx.reply(t("setup.invalidWorkdayFormat"), { parse_mode: "Markdown" });
        return;
      }
      SessionStore.set(userId, { step: "setup:timezone", data: { ...session.data, workdays } });
      await ctx.reply(t("setup.chooseTimezone"), { parse_mode: "Markdown" });
      break;
    }

    case "setup:timezone": {
      const choice = parseInt(text, 10);
      if (choice >= 1 && choice <= 4) {
        const timezone = PREDEFINED_TIMEZONES[choice - 1];
        await completeSetup(ctx, userId, { ...session.data, timezone });
      } else if (text === "5") {
        SessionStore.set(userId, { step: "setup:timezone_custom", data: session.data });
        await ctx.reply(t("setup.askCustomTimezone"), { parse_mode: "Markdown" });
      } else {
        await ctx.reply(t("setup.invalidTimezoneChoice"), { parse_mode: "Markdown" });
      }
      break;
    }

    case "setup:timezone_custom": {
      if (!text) {
        await ctx.reply(t("setup.askCustomTimezone"), { parse_mode: "Markdown" });
        return;
      }
      await completeSetup(ctx, userId, { ...session.data, timezone: text });
      break;
    }
  }
}

/** Saves settings after the last setup step and sends the completion message. */
async function completeSetup(
  ctx: Context,
  userId: string,
  data: { hours?: number; workdays?: number[]; timezone?: string }
): Promise<void> {
  SessionStore.clear(userId);
  try {
    const settings = await setupSettings({
      telegramId: userId,
      dailyHoursOrMinutes: data.hours!,
      workdays: data.workdays! as Weekday[],
      timezone: data.timezone!,
    });

    const dailyHoursStr = formatMinutesAsDuration(settings.dailyRequiredMinutes);
    const workdaysStr = formatWorkdays(settings.workdays as Weekday[]);
    const settingsBlock = t("settings.display", { dailyHoursStr, workdaysStr, timezone: settings.timezone });

    await ctx.reply(
      t("setup.complete", { settings: settingsBlock }),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err);
  }
}

export function startSetupFlow(ctx: Context, userId: string): Promise<void> {
  SessionStore.set(userId, { step: "setup:hours", data: {} });
  return ctx.reply(t("setup.askHours"), { parse_mode: "Markdown" }).then(() => undefined);
}
