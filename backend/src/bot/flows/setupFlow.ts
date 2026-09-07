import type { Context } from "telegraf";
import { SessionStore } from "@/bot/session/SessionStore";
import type { Session } from "@/bot/session/SessionStore";
import {
  setupSettings,
  DEFAULT_VACATION_ACCRUAL_RATE,
  DEFAULT_SICK_ACCRUAL_RATE,
} from "@/services/SettingsService";
import { formatMinutesAsDuration, formatDecimalDays } from "@/bot/utils/formatMessage";
import { t, formatWorkdays } from "@/i18n";
import { handleBotError } from "@/bot/utils/handleBotError";
import type { Weekday } from "@shared/types/CoreTypes";
import { PREDEFINED_TIMEZONES } from "@/constants/timezones";
import { parseWorkdayList, parseStrictNumber } from "@/bot/utils/timeInputParser";
import { isValidTimezone } from "@/utils/DateUtils";

/** "skip" (any case) or empty input means "use the default rate". */
function isSkip(text: string): boolean {
  return text === "" || text.toLowerCase() === "skip";
}

export async function handleSetupStep(
  ctx: Context,
  userId: string,
  text: string,
  session: Session
): Promise<void> {
  switch (session.step) {
    case "setup:hours": {
      const hours = parseStrictNumber(text);
      if (hours === null || hours <= 0) {
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
        SessionStore.set(userId, { step: "setup:vacation_rate", data: { ...session.data, timezone } });
        await ctx.reply(t("setup.askVacationRate"), { parse_mode: "Markdown" });
      } else if (text === "5") {
        SessionStore.set(userId, { step: "setup:timezone_custom", data: session.data });
        await ctx.reply(t("setup.askCustomTimezone"), { parse_mode: "Markdown" });
      } else {
        await ctx.reply(t("setup.invalidTimezoneChoice"), { parse_mode: "Markdown" });
      }
      break;
    }

    case "setup:timezone_custom": {
      if (!text || !isValidTimezone(text)) {
        await ctx.reply(t("setup.invalidCustomTimezone"), { parse_mode: "Markdown" });
        return;
      }
      SessionStore.set(userId, { step: "setup:vacation_rate", data: { ...session.data, timezone: text } });
      await ctx.reply(t("setup.askVacationRate"), { parse_mode: "Markdown" });
      break;
    }

    case "setup:vacation_rate": {
      let vacationAccrualRate = DEFAULT_VACATION_ACCRUAL_RATE;
      if (!isSkip(text)) {
        const parsed = parseStrictNumber(text);
        if (parsed === null || parsed < 0) {
          await ctx.reply(t("setup.invalidVacationRate"), { parse_mode: "Markdown" });
          return;
        }
        vacationAccrualRate = parsed;
      }
      SessionStore.set(userId, { step: "setup:sick_rate", data: { ...session.data, vacationAccrualRate } });
      await ctx.reply(t("setup.askSickRate"), { parse_mode: "Markdown" });
      break;
    }

    case "setup:sick_rate": {
      let sickAccrualRate = DEFAULT_SICK_ACCRUAL_RATE;
      if (!isSkip(text)) {
        const parsed = parseStrictNumber(text);
        if (parsed === null || parsed < 0) {
          await ctx.reply(t("setup.invalidSickRate"), { parse_mode: "Markdown" });
          return;
        }
        sickAccrualRate = parsed;
      }
      await completeSetup(ctx, userId, { ...session.data, sickAccrualRate });
      break;
    }
  }
}

/** Saves settings after the last setup step and sends the completion message. */
async function completeSetup(
  ctx: Context,
  userId: string,
  data: {
    hours?: number;
    workdays?: number[];
    timezone?: string;
    vacationAccrualRate?: number;
    sickAccrualRate?: number;
  }
): Promise<void> {
  SessionStore.clear(userId);
  try {
    const settings = await setupSettings({
      telegramId: userId,
      dailyHoursOrMinutes: data.hours!,
      workdays: data.workdays! as Weekday[],
      timezone: data.timezone!,
      vacationAccrualRate: data.vacationAccrualRate,
      sickAccrualRate: data.sickAccrualRate,
    });

    const dailyHoursStr = formatMinutesAsDuration(settings.dailyRequiredMinutes);
    const workdaysStr = formatWorkdays(settings.workdays as Weekday[]);
    const vacationRateStr = formatDecimalDays(settings.vacationAccrualRate);
    const sickRateStr = formatDecimalDays(settings.sickAccrualRate);
    const settingsBlock = t("settings.display", {
      dailyHoursStr,
      workdaysStr,
      timezone: settings.timezone,
      vacationRateStr,
      sickRateStr,
    });

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
