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
import { getSettingsOrThrow } from "@/services/SettingsService";
import { setEndHour, setStartAndEndHours, markAbsence } from "@/services/EditWorkdayService";
import { formatTime, formatMinutesAsDuration, formatBalance } from "@/bot/utils/formatMessage";
import { t } from "@/i18n";
import { handleBotError } from "@/bot/utils/handleBotError";
import { HH_MM_RE, HH_MM_RANGE_RE } from "@/constants/timeFormats";
import { ABSENCE_TYPES } from "@/constants/absenceTypes";
import { type EditAction, EDIT_ACTION_MAP } from "@/constants/editActions";
import { handleSetupStep } from "@/bot/flows/setupFlow";
import { handleSettingsEditStep } from "@/bot/flows/settingsEditFlow";

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

// ── /edit dd-mm flow ──────────────────────────────────────────────────────────

async function handleEditStep(
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
    case "edit:choose_action": {
      const { ddMm, editState } = session.data;
      if (!ddMm || !editState) { SessionStore.clear(userId); return; }

      const actionMap = EDIT_ACTION_MAP[editState] ?? {};
      const action = actionMap[text];

      if (!action) {
        const maxChoice = Object.keys(actionMap).length;
        await ctx.reply(t("edit.invalidChoice", { maxChoice }), { parse_mode: "Markdown" });
        return;
      }

      if (action === "CANCEL") {
        SessionStore.clear(userId);
        await ctx.reply(t("edit.cancelled"), { parse_mode: "Markdown" });
        return;
      }

      if (action === "SET_END_HOUR") {
        SessionStore.set(userId, { step: "edit:set_end_hour", data: { ddMm } });
        await ctx.reply(t("edit.promptEndHour"), { parse_mode: "Markdown" });
      } else if (action === "SET_START_AND_END") {
        SessionStore.set(userId, { step: "edit:set_start_end", data: { ddMm } });
        await ctx.reply(t("edit.promptStartAndEndHours"), { parse_mode: "Markdown" });
      } else if (action === "MARK_ABSENCE") {
        SessionStore.set(userId, { step: "edit:choose_absence", data: { ddMm } });
        await ctx.reply(t("edit.absenceTypeList"), { parse_mode: "Markdown" });
      }
      break;
    }

    case "edit:set_end_hour": {
      const { ddMm } = session.data;
      if (!ddMm) { SessionStore.clear(userId); return; }

      if (!HH_MM_RE.test(text)) {
        await ctx.reply(t("edit.invalidPromptEndHour"), { parse_mode: "Markdown" });
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
          t("edit.endHourSaved", { date: ddMm, startStr, endStr, workedStr, balanceStr }),
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        await handleBotError(ctx, err);
      }
      break;
    }

    case "edit:set_start_end": {
      const { ddMm } = session.data;
      if (!ddMm) { SessionStore.clear(userId); return; }

      const match = HH_MM_RANGE_RE.exec(text);
      if (!match) {
        await ctx.reply(t("edit.invalidPromptStartAndEndHours"), { parse_mode: "Markdown" });
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
          t("edit.startEndSaved", { date: ddMm, startStr, endStr, workedStr, balanceStr }),
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        await handleBotError(ctx, err);
      }
      break;
    }

    case "edit:choose_absence": {
      const { ddMm } = session.data;
      if (!ddMm) { SessionStore.clear(userId); return; }

      const idx = parseInt(text, 10);
      if (isNaN(idx) || idx < 1 || idx > 6) {
        await ctx.reply(t("edit.invalidAbsenceTypeList"), { parse_mode: "Markdown" });
        return;
      }

      const absenceType = ABSENCE_TYPES[idx - 1];
      SessionStore.clear(userId);
      try {
        const settings = await getSettingsOrThrow(userId);
        const result = await markAbsence(userId, ddMm, absenceType);
        const absenceLabel = t(`absenceType.${absenceType}`);
        const creditedStr = formatMinutesAsDuration(result.workedMinutes);
        const balanceStr = formatBalance(result.balanceMinutes);

        await ctx.reply(
          t("edit.absenceSaved", { date: ddMm, absenceLabel, creditedStr, balanceStr }),
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        await handleBotError(ctx, err);
      }
      break;
    }
  }
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
