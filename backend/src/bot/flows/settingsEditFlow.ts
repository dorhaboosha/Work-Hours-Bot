import type { Context } from "telegraf";
import { SessionStore } from "@/bot/session/SessionStore";
import type { Session } from "@/bot/session/SessionStore";
import { updateSettings, getSettingsOrThrow } from "@/services/SettingsService";
import { formatMinutesAsDuration } from "@/bot/utils/formatMessage";
import { t, formatWorkdays } from "@/i18n";
import { handleBotError } from "@/bot/utils/handleBotError";
import { decimalHoursToMinutes } from "@shared/utils/timeUtils";
import type { Weekday } from "@shared/types/CoreTypes";
import { PREDEFINED_TIMEZONES } from "@/constants/timezones";
import { parseWorkdayList } from "@/bot/utils/timeInputParser";

export async function handleSettingsEditStep(
  ctx: Context,
  userId: string,
  text: string,
  session: Session
): Promise<void> {
  try {
    await getSettingsOrThrow(userId);
  } catch (err) {
    SessionStore.clear(userId);
    await handleBotError(ctx, err);
    return;
  }

  switch (session.step) {
    case "settings_edit:choose_field": {
      if (text === "1") {
        SessionStore.set(userId, { step: "settings_edit:hours", data: {} });
        await ctx.reply(t("settingsEdit.askHours"), { parse_mode: "Markdown" });
      } else if (text === "2") {
        SessionStore.set(userId, { step: "settings_edit:workdays", data: {} });
        await ctx.reply(t("settingsEdit.chooseWorkdays"), { parse_mode: "Markdown" });
      } else if (text === "3") {
        SessionStore.set(userId, { step: "settings_edit:timezone", data: {} });
        await ctx.reply(t("settingsEdit.chooseTimezone"), { parse_mode: "Markdown" });
      } else {
        await ctx.reply(t("settingsEdit.invalidChooseField"), { parse_mode: "Markdown" });
      }
      break;
    }

    case "settings_edit:hours": {
      const hours = parseFloat(text);
      if (isNaN(hours) || hours <= 0) {
        await ctx.reply(t("settingsEdit.invalidAskHours"), { parse_mode: "Markdown" });
        return;
      }
      const mins = hours >= 60 ? Math.round(hours) : decimalHoursToMinutes(hours);
      await applySettingsUpdate(ctx, userId, { dailyRequiredMinutes: mins });
      break;
    }

    case "settings_edit:workdays": {
      if (text === "1") {
        await applySettingsUpdate(ctx, userId, { workdays: [0,1,2,3,4] as Weekday[] });
      } else if (text === "2") {
        await applySettingsUpdate(ctx, userId, { workdays: [1,2,3,4,5] as Weekday[] });
      } else if (text === "3") {
        SessionStore.set(userId, { step: "settings_edit:workdays_custom", data: {} });
        await ctx.reply(t("settingsEdit.askCustomWorkdays"), { parse_mode: "Markdown" });
      } else {
        await ctx.reply(t("settingsEdit.invalidChooseWorkdays"), { parse_mode: "Markdown" });
      }
      break;
    }

    case "settings_edit:workdays_custom": {
      const workdays = parseWorkdayList(text);
      if (workdays === null) {
        await ctx.reply(t("settingsEdit.invalidAskCustomWorkdays"), { parse_mode: "Markdown" });
        return;
      }
      await applySettingsUpdate(ctx, userId, { workdays: workdays as Weekday[] });
      break;
    }

    case "settings_edit:timezone": {
      const choice = parseInt(text, 10);
      if (choice >= 1 && choice <= 4) {
        await applySettingsUpdate(ctx, userId, { timezone: PREDEFINED_TIMEZONES[choice - 1] });
      } else if (text === "5") {
        SessionStore.set(userId, { step: "settings_edit:timezone_custom", data: {} });
        await ctx.reply(t("settingsEdit.askCustomTimezone"), { parse_mode: "Markdown" });
      } else {
        await ctx.reply(t("settingsEdit.invalidChooseTimezone"), { parse_mode: "Markdown" });
      }
      break;
    }

    case "settings_edit:timezone_custom": {
      if (!text) {
        await ctx.reply(t("settingsEdit.askCustomTimezone"), { parse_mode: "Markdown" });
        return;
      }
      await applySettingsUpdate(ctx, userId, { timezone: text });
      break;
    }
  }
}

/** Saves the settings update, replies with confirmation, and clears the session. */
async function applySettingsUpdate(
  ctx: Context,
  userId: string,
  update: { dailyRequiredMinutes?: number; timezone?: string; workdays?: Weekday[] }
): Promise<void> {
  SessionStore.clear(userId);
  try {
    const updated = await updateSettings(userId, update);
    const dailyHoursStr = formatMinutesAsDuration(updated.dailyRequiredMinutes);
    const workdaysStr = formatWorkdays(updated.workdays as Weekday[]);
    const settingsBlock = t("settings.display", { dailyHoursStr, workdaysStr, timezone: updated.timezone });

    await ctx.reply(t("settingsEdit.updated", { settings: settingsBlock }), { parse_mode: "Markdown" });
  } catch (err) {
    await handleBotError(ctx, err);
  }
}

export async function startSettingsEditFlow(ctx: Context, userId: string): Promise<void> {
  SessionStore.set(userId, { step: "settings_edit:choose_field", data: {} });
  await ctx.reply(t("settingsEdit.chooseField"), { parse_mode: "Markdown" });
}
