/**
 * Handles plain-text replies that continue an active multi-step conversation.
 * Registered with bot.on("text", …) in BotCommands.ts.
 *
 * A separate "clear session on command" middleware in BotCommands.ts ensures
 * that any /command automatically terminates an in-progress flow so the
 * command's own handler can start fresh.
 */
import type { Context } from "telegraf";
import { SessionStore } from "@/bot/session/SessionStore";
import type { Session } from "@/bot/session/SessionStore";
import { setupSettings, updateSettings, getSettingsOrThrow } from "@/services/SettingsService";
import { setEndHour, setStartAndEndHours, markAbsence } from "@/services/EditWorkdayService";
import { formatTime, formatMinutesAsDuration, formatBalance } from "@/bot/utils/formatMessage";
import { t, formatWorkdays } from "@/i18n";
import { handleBotError } from "@/bot/utils/handleBotError";
import { decimalHoursToMinutes } from "@shared/utils/timeUtils";
import type { Weekday, AbsenceRecordType } from "@shared/types/CoreTypes";

// ── Setup conversation constants ───────────────────────────────────────────────

const SETUP_ASK_HOURS = [
  "⚙️ *Let's set up your work schedule!*",
  "",
  "*Step 1 of 3 — Daily hours*",
  "",
  "How many hours do you work per day?",
  "",
  "Example: `8.8` (= 8 hours and 48 minutes)",
].join("\n");

const SETUP_CHOOSE_WORKDAYS = [
  "*Step 2 of 3 — Workdays*",
  "",
  "Choose your workdays:",
  "",
  "1. Sunday–Thursday",
  "2. Monday–Friday",
  "3. Custom",
].join("\n");

const SETUP_ASK_CUSTOM_WORKDAYS = [
  "Enter your workdays as comma-separated numbers:",
  "",
  "0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday",
  "",
  "Example: `0,1,2,3,4`",
].join("\n");

const SETUP_CHOOSE_TIMEZONE = [
  "*Step 3 of 3 — Timezone*",
  "",
  "Choose your timezone:",
  "",
  "1. Asia/Jerusalem",
  "2. Europe/London",
  "3. Europe/Berlin",
  "4. America/New\\_York",
  "5. Custom (IANA format)",
].join("\n");

const SETUP_ASK_CUSTOM_TIMEZONE = [
  "Enter your timezone in IANA format:",
  "",
  "Example: `Asia/Jerusalem`",
].join("\n");

const PREDEFINED_TIMEZONES = [
  "Asia/Jerusalem",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseWorkdayList(raw: string): Weekday[] | null {
  const parts = raw.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length === 0) return null;
  if (parts.some((n) => isNaN(n) || n < 0 || n > 6)) return null;
  return parts as Weekday[];
}

const HH_MM_RE = /^\d{2}:\d{2}$/;
const HH_MM_RANGE_RE = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/;

const ABSENCE_TYPES: AbsenceRecordType[] = [
  "SICK",
  "VACATION",
  "HOLIDAY",
  "HOLIDAY_EVE",
  "UNPAID_ABSENCE",
  "ELECTION",
];

/** Action choices indexed by EditRecordState */
type EditAction = "SET_END_HOUR" | "SET_START_AND_END" | "MARK_ABSENCE" | "CANCEL";
const EDIT_ACTION_MAP: Record<string, Record<string, EditAction>> = {
  OPEN_WORK_RECORD:   { "1": "SET_END_HOUR", "2": "SET_START_AND_END", "3": "MARK_ABSENCE", "4": "CANCEL" },
  NO_RECORD:          { "1": "SET_START_AND_END", "2": "MARK_ABSENCE", "3": "CANCEL" },
  CLOSED_WORK_RECORD: { "1": "SET_START_AND_END", "2": "MARK_ABSENCE", "3": "CANCEL" },
  ABSENCE_RECORD:     { "1": "SET_START_AND_END", "2": "MARK_ABSENCE", "3": "CANCEL" },
};

// ── Main entry point ──────────────────────────────────────────────────────────

export async function handleConversation(ctx: Context): Promise<void> {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const session = SessionStore.get(userId);
  if (!session) return;

  const text = ((ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "").trim();

  if (session.step.startsWith("setup:")) {
    await handleSetupStep(ctx, userId, text, session);
  } else if (session.step.startsWith("settings_edit:")) {
    await handleSettingsEditStep(ctx, userId, text, session);
  } else if (session.step.startsWith("edit:")) {
    await handleEditStep(ctx, userId, text, session);
  }
}

// ── /setup flow ───────────────────────────────────────────────────────────────

async function handleSetupStep(
  ctx: Context,
  userId: string,
  text: string,
  session: Session
): Promise<void> {
  switch (session.step) {
    case "setup:hours": {
      const hours = parseFloat(text);
      if (isNaN(hours) || hours <= 0) {
        await ctx.reply(
          "❌ Please enter a valid positive number.\n\nExample: `8.8`",
          { parse_mode: "Markdown" }
        );
        return;
      }
      SessionStore.set(userId, { step: "setup:workdays", data: { hours } });
      await ctx.reply(SETUP_CHOOSE_WORKDAYS, { parse_mode: "Markdown" });
      break;
    }

    case "setup:workdays": {
      if (text === "1") {
        SessionStore.set(userId, { step: "setup:timezone", data: { ...session.data, workdays: [0,1,2,3,4] } });
        await ctx.reply(SETUP_CHOOSE_TIMEZONE, { parse_mode: "Markdown" });
      } else if (text === "2") {
        SessionStore.set(userId, { step: "setup:timezone", data: { ...session.data, workdays: [1,2,3,4,5] } });
        await ctx.reply(SETUP_CHOOSE_TIMEZONE, { parse_mode: "Markdown" });
      } else if (text === "3") {
        SessionStore.set(userId, { step: "setup:workdays_custom", data: session.data });
        await ctx.reply(SETUP_ASK_CUSTOM_WORKDAYS, { parse_mode: "Markdown" });
      } else {
        await ctx.reply("❌ Please choose 1, 2, or 3.\n\n" + SETUP_CHOOSE_WORKDAYS, { parse_mode: "Markdown" });
      }
      break;
    }

    case "setup:workdays_custom": {
      const workdays = parseWorkdayList(text);
      if (workdays === null) {
        await ctx.reply(
          "❌ Invalid format. Use comma-separated numbers 0–6.\n\nExample: `0,1,2,3,4`",
          { parse_mode: "Markdown" }
        );
        return;
      }
      SessionStore.set(userId, { step: "setup:timezone", data: { ...session.data, workdays } });
      await ctx.reply(SETUP_CHOOSE_TIMEZONE, { parse_mode: "Markdown" });
      break;
    }

    case "setup:timezone": {
      const choice = parseInt(text, 10);
      if (choice >= 1 && choice <= 4) {
        const timezone = PREDEFINED_TIMEZONES[choice - 1];
        await completeSetup(ctx, userId, { ...session.data, timezone });
      } else if (text === "5") {
        SessionStore.set(userId, { step: "setup:timezone_custom", data: session.data });
        await ctx.reply(SETUP_ASK_CUSTOM_TIMEZONE, { parse_mode: "Markdown" });
      } else {
        await ctx.reply("❌ Please choose 1–5.\n\n" + SETUP_CHOOSE_TIMEZONE, { parse_mode: "Markdown" });
      }
      break;
    }

    case "setup:timezone_custom": {
      if (!text) {
        await ctx.reply(SETUP_ASK_CUSTOM_TIMEZONE, { parse_mode: "Markdown" });
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
    const workdaysStr = formatWorkdays(settings.workdays as Weekday[], "en");
    const settingsBlock = t("settings.display", "en", { dailyHoursStr, workdaysStr, timezone: settings.timezone });

    await ctx.reply(
      t("setup.complete", "en", { settings: settingsBlock }),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err);
  }
}

// ── /settings_edit flow ───────────────────────────────────────────────────────

async function handleSettingsEditStep(
  ctx: Context,
  userId: string,
  text: string,
  session: Session
): Promise<void> {
  const lang = "en";
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
        await ctx.reply(t("settingsEdit.askHours", lang), { parse_mode: "Markdown" });
      } else if (text === "2") {
        SessionStore.set(userId, { step: "settings_edit:workdays", data: {} });
        await ctx.reply(t("settingsEdit.chooseWorkdays", lang), { parse_mode: "Markdown" });
      } else if (text === "3") {
        SessionStore.set(userId, { step: "settings_edit:timezone", data: {} });
        await ctx.reply(t("settingsEdit.chooseTimezone", lang), { parse_mode: "Markdown" });
      } else {
        await ctx.reply(
          "❌ " + t("settingsEdit.chooseField", lang),
          { parse_mode: "Markdown" }
        );
      }
      break;
    }

    case "settings_edit:hours": {
      const hours = parseFloat(text);
      if (isNaN(hours) || hours <= 0) {
        await ctx.reply(
          "❌ " + t("settingsEdit.askHours", lang),
          { parse_mode: "Markdown" }
        );
        return;
      }
      const mins = hours >= 60 ? Math.round(hours) : decimalHoursToMinutes(hours);
      await applySettingsUpdate(ctx, userId, lang, { dailyRequiredMinutes: mins });
      break;
    }

    case "settings_edit:workdays": {
      if (text === "1") {
        await applySettingsUpdate(ctx, userId, lang, { workdays: [0,1,2,3,4] as Weekday[] });
      } else if (text === "2") {
        await applySettingsUpdate(ctx, userId, lang, { workdays: [1,2,3,4,5] as Weekday[] });
      } else if (text === "3") {
        SessionStore.set(userId, { step: "settings_edit:workdays_custom", data: {} });
        await ctx.reply(t("settingsEdit.askCustomWorkdays", lang), { parse_mode: "Markdown" });
      } else {
        await ctx.reply(
          "❌ " + t("settingsEdit.chooseWorkdays", lang),
          { parse_mode: "Markdown" }
        );
      }
      break;
    }

    case "settings_edit:workdays_custom": {
      const workdays = parseWorkdayList(text);
      if (workdays === null) {
        await ctx.reply(
          "❌ " + t("settingsEdit.askCustomWorkdays", lang),
          { parse_mode: "Markdown" }
        );
        return;
      }
      await applySettingsUpdate(ctx, userId, lang, { workdays: workdays as Weekday[] });
      break;
    }

    case "settings_edit:timezone": {
      const choice = parseInt(text, 10);
      if (choice >= 1 && choice <= 4) {
        await applySettingsUpdate(ctx, userId, lang, { timezone: PREDEFINED_TIMEZONES[choice - 1] });
      } else if (text === "5") {
        SessionStore.set(userId, { step: "settings_edit:timezone_custom", data: {} });
        await ctx.reply(t("settingsEdit.askCustomTimezone", lang), { parse_mode: "Markdown" });
      } else {
        await ctx.reply(
          "❌ " + t("settingsEdit.chooseTimezone", lang),
          { parse_mode: "Markdown" }
        );
      }
      break;
    }

    case "settings_edit:timezone_custom": {
      if (!text) {
        await ctx.reply(t("settingsEdit.askCustomTimezone", lang), { parse_mode: "Markdown" });
        return;
      }
      await applySettingsUpdate(ctx, userId, lang, { timezone: text });
      break;
    }

  }
}

/** Saves the settings update, replies with confirmation, and clears the session. */
async function applySettingsUpdate(
  ctx: Context,
  userId: string,
  lang: string,
  update: { dailyRequiredMinutes?: number; timezone?: string; workdays?: Weekday[] }
): Promise<void> {
  SessionStore.clear(userId);
  try {
    const updated = await updateSettings(userId, update);
    const dailyHoursStr = formatMinutesAsDuration(updated.dailyRequiredMinutes);
    const workdaysStr = formatWorkdays(updated.workdays as Weekday[], "en");
    const settingsBlock = t("settings.display", "en", {
      dailyHoursStr,
      workdaysStr,
      timezone: updated.timezone,
    });

    await ctx.reply(
      t("settingsEdit.updated", "en", { settings: settingsBlock }),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await handleBotError(ctx, err, lang);
  }
}

// ── /edit dd-mm flow ──────────────────────────────────────────────────────────

async function handleEditStep(
  ctx: Context,
  userId: string,
  text: string,
  session: Session
): Promise<void> {
  const lang = "en";
  try {
    await getSettingsOrThrow(userId);
  } catch (err) {
    SessionStore.clear(userId);
    await handleBotError(ctx, err);
    return;
  }

  switch (session.step) {
    case "edit:choose_action": {
      const { ddMm, editState } = session.data;
      if (!ddMm || !editState) { SessionStore.clear(userId); return; }

      const actionMap = EDIT_ACTION_MAP[editState] ?? {};
      const action = actionMap[text];

      if (!action) {
        const maxChoice = Object.keys(actionMap).length;
        await ctx.reply(
          `❌ Please choose a number between 1 and ${maxChoice}.`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      if (action === "CANCEL") {
        SessionStore.clear(userId);
        await ctx.reply(t("edit.cancelled", lang), { parse_mode: "Markdown" });
        return;
      }

      if (action === "SET_END_HOUR") {
        SessionStore.set(userId, { step: "edit:set_end_hour", data: { ddMm } });
        await ctx.reply(t("edit.promptEndHour", lang), { parse_mode: "Markdown" });
      } else if (action === "SET_START_AND_END") {
        SessionStore.set(userId, { step: "edit:set_start_end", data: { ddMm } });
        await ctx.reply(t("edit.promptStartAndEndHours", lang), { parse_mode: "Markdown" });
      } else if (action === "MARK_ABSENCE") {
        SessionStore.set(userId, { step: "edit:choose_absence", data: { ddMm } });
        await ctx.reply(t("edit.absenceTypeList", lang), { parse_mode: "Markdown" });
      }
      break;
    }

    case "edit:set_end_hour": {
      const { ddMm } = session.data;
      if (!ddMm) { SessionStore.clear(userId); return; }

      if (!HH_MM_RE.test(text)) {
        await ctx.reply(
          "❌ " + t("edit.promptEndHour", lang),
          { parse_mode: "Markdown" }
        );
        return;
      }

      SessionStore.clear(userId);
      try {
        const settings = await getSettingsOrThrow(userId);
        const result = await setEndHour(userId, ddMm, text);
        const startStr = formatTime(result.startTime!, settings.timezone);
        const endStr = formatTime(result.endTime!, settings.timezone);
        const workedStr = formatMinutesAsDuration(result.workedMinutes);
        const balanceStr = formatBalance(result.balanceMinutes);

        await ctx.reply(
          t("edit.endHourSaved", lang, { date: ddMm, startStr, endStr, workedStr, balanceStr }),
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        await handleBotError(ctx, err, lang);
      }
      break;
    }

    case "edit:set_start_end": {
      const { ddMm } = session.data;
      if (!ddMm) { SessionStore.clear(userId); return; }

      const match = HH_MM_RANGE_RE.exec(text);
      if (!match) {
        await ctx.reply(
          "❌ " + t("edit.promptStartAndEndHours", lang),
          { parse_mode: "Markdown" }
        );
        return;
      }

      const [, startHhMm, endHhMm] = match;
      SessionStore.clear(userId);
      try {
        const settings = await getSettingsOrThrow(userId);
        const result = await setStartAndEndHours(userId, ddMm, startHhMm, endHhMm);
        const startStr = formatTime(result.startTime!, settings.timezone);
        const endStr = formatTime(result.endTime!, settings.timezone);
        const workedStr = formatMinutesAsDuration(result.workedMinutes);
        const balanceStr = formatBalance(result.balanceMinutes);

        await ctx.reply(
          t("edit.startEndSaved", lang, { date: ddMm, startStr, endStr, workedStr, balanceStr }),
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        await handleBotError(ctx, err, lang);
      }
      break;
    }

    case "edit:choose_absence": {
      const { ddMm } = session.data;
      if (!ddMm) { SessionStore.clear(userId); return; }

      const idx = parseInt(text, 10);
      if (isNaN(idx) || idx < 1 || idx > 6) {
        await ctx.reply(
          "❌ " + t("edit.absenceTypeList", lang),
          { parse_mode: "Markdown" }
        );
        return;
      }

      const absenceType = ABSENCE_TYPES[idx - 1];
      SessionStore.clear(userId);
      try {
        const settings = await getSettingsOrThrow(userId);
        const result = await markAbsence(userId, ddMm, absenceType);
        const absenceLabel = t(`absenceType.${absenceType}`, lang);
        const creditedStr = formatMinutesAsDuration(result.workedMinutes);
        const balanceStr = formatBalance(result.balanceMinutes);

        await ctx.reply(
          t("edit.absenceSaved", lang, { date: ddMm, absenceLabel, creditedStr, balanceStr }),
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        await handleBotError(ctx, err, lang);
      }
      break;
    }
  }
}

// ── Exported starter for /setup (called by SetupCommandHandler) ───────────────

export function startSetupFlow(ctx: Context, userId: string): Promise<void> {
  SessionStore.set(userId, { step: "setup:hours", data: {} });
  return ctx.reply(SETUP_ASK_HOURS, { parse_mode: "Markdown" }).then(() => undefined);
}

// ── Exported starter for /settings_edit (called by SettingsEditCommandHandler) ─

export async function startSettingsEditFlow(
  ctx: Context,
  userId: string,
  lang: string
): Promise<void> {
  SessionStore.set(userId, { step: "settings_edit:choose_field", data: {} });
  await ctx.reply(t("settingsEdit.chooseField", lang), { parse_mode: "Markdown" });
}

// ── Exported starter for /edit (called by EditCommandHandler) ─────────────────

export async function startEditFlow(
  ctx: Context,
  userId: string,
  ddMm: string,
  editState: string,
  prompt: string
): Promise<void> {
  SessionStore.set(userId, { step: "edit:choose_action", data: { ddMm, editState } });
  await ctx.reply(prompt, { parse_mode: "Markdown" });
}
