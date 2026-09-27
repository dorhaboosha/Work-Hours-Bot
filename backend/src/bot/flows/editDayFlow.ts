import type { Context } from "telegraf";
import { SessionStore } from "@/bot/session/SessionStore";
import type { Session } from "@/bot/session/SessionStore";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { setEndHour, setStartAndEndHours, setHoursOnHalfDay, markAbsence } from "@/services/EditWorkdayService";
import {
  formatTime,
  formatMinutesAsDuration,
  formatBalance,
  formatDecimalDays,
  formatLeaveFieldLabel,
} from "@/bot/utils/formatMessage";
import { t } from "@/i18n";
import { handleBotError } from "@/bot/utils/handleBotError";
import { HH_MM_RE, HH_MM_RANGE_RE } from "@/constants/timeFormats";
import { ABSENCE_TYPES } from "@/constants/absenceTypes";
import { EDIT_ACTION_MAP } from "@/constants/editActions";
import { requiresPortionChoice } from "@shared/utils/recordTypeUtils";
import type { AbsencePortion, AbsenceRecordType } from "@shared/types/CoreTypes";
import type { EditWorkdayResult } from "@shared/types/ViewTypes";

/**
 * Maps the portion menu choice to the absence portion. Same keys for both menus:
 * - VACATION / SICK: 1 = full day, 2 = half day.
 * - HOLIDAY_EVE (company covers half): 1 = other half as ½ vacation day (FULL),
 *   2 = other half worked (HALF).
 */
const PORTION_CHOICES: Record<string, AbsencePortion> = { "1": "FULL", "2": "HALF" };

/**
 * Appends an optional refund line and/or an optional debit line to a base
 * message, when the result carries them. A single edit can produce a
 * refund, a new debit, both (e.g. re-marking a date from one debitable type
 * to another), or neither.
 */
function appendLeaveAdjustmentLines(
  base: string,
  result: Pick<EditWorkdayResult, "leaveRefund" | "leaveDebit">
): string {
  let message = base;
  if (result.leaveRefund) {
    message += t("edit.leaveRefundLine", {
      amount: formatDecimalDays(result.leaveRefund.amount),
      fieldLabel: formatLeaveFieldLabel(result.leaveRefund.field),
      newBalance: formatDecimalDays(result.leaveRefund.newBalance),
    });
  }
  if (result.leaveDebit) {
    message += t("edit.leaveDebitLine", {
      amount: formatDecimalDays(result.leaveDebit.amount),
      fieldLabel: formatLeaveFieldLabel(result.leaveDebit.field),
      newBalance: formatDecimalDays(result.leaveDebit.newBalance),
    });
  }
  return message;
}

export async function handleEditStep(
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
      } else if (action === "CONVERT_TO_WORK") {
        // Same step as SET_START_AND_END: replacing the half day with a work
        // day is exactly what setStartAndEndHours does (refunding any debit).
        SessionStore.set(userId, { step: "edit:set_start_end", data: { ddMm } });
        await ctx.reply(t("edit.promptConvertToWork"), { parse_mode: "Markdown" });
      } else if (action === "LOG_HOURS") {
        SessionStore.set(userId, { step: "edit:log_hours", data: { ddMm } });
        await ctx.reply(t("edit.promptLogHours"), { parse_mode: "Markdown" });
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

        const message = appendLeaveAdjustmentLines(
          t("edit.startEndSaved", { date: ddMm, startStr, endStr, workedStr, balanceStr }),
          result
        );
        await ctx.reply(message, { parse_mode: "Markdown" });
      } catch (err) {
        await handleBotError(ctx, err);
      }
      break;
    }

    case "edit:log_hours": {
      const { ddMm } = session.data;
      if (!ddMm) { SessionStore.clear(userId); return; }

      const match = HH_MM_RANGE_RE.exec(text);
      if (!match) {
        await ctx.reply(t("edit.invalidPromptLogHours"), { parse_mode: "Markdown" });
        return;
      }

      const [, startHhMm, endHhMm] = match;
      SessionStore.clear(userId);
      try {
        const settings = await getSettingsOrThrow(userId);
        const result = await setHoursOnHalfDay(userId, ddMm, startHhMm, endHhMm);

        await ctx.reply(
          t("edit.halfDayHoursSaved", {
            date: ddMm,
            absenceLabel: t(`absenceType.${result.recordType}`),
            creditedStr: formatMinutesAsDuration(result.creditedMinutes),
            startStr: formatTime(result.startTime!, settings.timezone),
            endStr: formatTime(result.endTime!, settings.timezone),
            workedStr: formatMinutesAsDuration(result.workedMinutes),
            balanceStr: formatBalance(result.balanceMinutes),
          }),
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

      if (requiresPortionChoice(absenceType) || absenceType === "HOLIDAY_EVE") {
        // Ask whether it was a full or half day (or, for a holiday eve, how
        // the non-company half was covered) before saving.
        const absenceLabel = t(`absenceType.${absenceType}`);
        SessionStore.set(userId, { step: "edit:choose_portion", data: { ddMm, absenceType } });
        const prompt =
          absenceType === "HOLIDAY_EVE"
            ? t("edit.promptEveCoverage")
            : t("edit.promptPortion", { absenceLabel });
        await ctx.reply(prompt, { parse_mode: "Markdown" });
        break;
      }

      SessionStore.clear(userId);
      try {
        await getSettingsOrThrow(userId);
        const result = await markAbsence(userId, ddMm, absenceType);
        const absenceLabel = t(`absenceType.${absenceType}`);
        const creditedStr = formatMinutesAsDuration(result.creditedMinutes + result.workedMinutes);
        const balanceStr = formatBalance(result.balanceMinutes);

        const message = appendLeaveAdjustmentLines(
          t("edit.absenceSaved", { date: ddMm, absenceLabel, creditedStr, balanceStr }),
          result
        ) + (result.absencePortion === "HALF" ? t("edit.halfDayHint", { date: ddMm }) : "");
        await ctx.reply(message, { parse_mode: "Markdown" });
      } catch (err) {
        await handleBotError(ctx, err);
      }
      break;
    }

    case "edit:choose_portion": {
      const { ddMm, absenceType } = session.data;
      if (!ddMm || !absenceType) { SessionStore.clear(userId); return; }

      // Own-key check so inherited names ("constructor", "__proto__", …) are
      // rejected rather than resolving to Object.prototype members.
      if (!Object.hasOwn(PORTION_CHOICES, text)) {
        const invalidKey =
          absenceType === "HOLIDAY_EVE" ? "edit.invalidEveCoverage" : "edit.invalidPortion";
        await ctx.reply(t(invalidKey), { parse_mode: "Markdown" });
        return;
      }
      const portion = PORTION_CHOICES[text];

      SessionStore.clear(userId);
      try {
        const result = await markAbsence(
          userId,
          ddMm,
          absenceType as AbsenceRecordType,
          portion
        );
        const absenceLabel = t(`absenceType.${absenceType}`);
        const creditedStr = formatMinutesAsDuration(result.creditedMinutes + result.workedMinutes);
        const balanceStr = formatBalance(result.balanceMinutes);

        const message = appendLeaveAdjustmentLines(
          t("edit.absenceSaved", { date: ddMm, absenceLabel, creditedStr, balanceStr }),
          result
        ) + (result.absencePortion === "HALF" ? t("edit.halfDayHint", { date: ddMm }) : "");
        await ctx.reply(message, { parse_mode: "Markdown" });
      } catch (err) {
        await handleBotError(ctx, err);
      }
      break;
    }
  }
}

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
