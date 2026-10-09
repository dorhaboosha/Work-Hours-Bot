import type { Context } from "telegraf";
import { SessionStore } from "@/bot/session/SessionStore";
import type { Session } from "@/bot/session/SessionStore";
import { getSettingsOrThrow } from "@/services/SettingsService";
import {
  setEndHour,
  setStartAndEndHours,
  setHoursOnHalfDay,
  markAbsence,
  addWorkPeriod,
  editWorkPeriod,
  removeWorkPeriod,
  getEditDayOptions,
} from "@/services/EditWorkdayService";
import { formatPeriodsSaved } from "@/bot/utils/formatEditMessage";
import {
  formatTime,
  formatMinutesAsDuration,
  formatBalance,
  formatDecimalDays,
  formatLeaveFieldLabel,
} from "@/bot/utils/formatMessage";
import { t } from "@/i18n";
import { handleBotError, escapeMarkdown } from "@/bot/utils/handleBotError";
import { AppError } from "@/utils/AppError";
import { HH_MM_RE, HH_MM_RANGE_RE } from "@/constants/timeFormats";
import { ABSENCE_TYPES } from "@/constants/absenceTypes";
import type { EditAction } from "@/constants/editActions";
import { requiresPortionChoice, isAbsenceRecordType } from "@shared/utils/recordTypeUtils";
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
 * Parses a numbered menu reply: a plain whole number from 1 to `max`, or null.
 * Strict, so "2abc" or "1.5" are rejected rather than read as 2 or 1.
 */
function parseChoice(text: string, max: number): number | null {
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= max ? n : null;
}

/**
 * Runs a times-entry step's save and replies with the message it returns,
 * ending the conversation. When the times are rejected as a bad range (end
 * not after start, or overlapping another work period), the conversation
 * stays on the same step and asks for different times. Any other error ends
 * it like before.
 */
async function saveTimes(
  ctx: Context,
  userId: string,
  save: () => Promise<string>
): Promise<void> {
  let message: string;
  try {
    message = await save();
  } catch (err) {
    if (err instanceof AppError && err.code === "INVALID_TIME_RANGE") {
      await ctx.reply(t("edit.invalidTimesRetry", { message: escapeMarkdown(err.message) }), {
        parse_mode: "Markdown",
      });
      return;
    }
    SessionStore.clear(userId);
    await handleBotError(ctx, err);
    return;
  }
  SessionStore.clear(userId);
  await ctx.reply(message, { parse_mode: "Markdown" });
}

/**
 * Asks the user to confirm deleting a date's only work period, naming its
 * times and what happens to the day (a work day's record is removed; a half
 * day keeps its absence). Re-reads the date so the question reflects it now;
 * if it no longer has exactly one period, asks which period to delete instead.
 */
async function askToConfirmDeletingLastPeriod(
  ctx: Context,
  userId: string,
  ddMm: string
): Promise<void> {
  let options: Awaited<ReturnType<typeof getEditDayOptions>>;
  try {
    options = await getEditDayOptions(userId, ddMm);
  } catch (err) {
    SessionStore.clear(userId);
    await handleBotError(ctx, err);
    return;
  }

  const { periods, timezone, record } = options;
  if (periods.length !== 1) {
    SessionStore.set(userId, {
      step: "edit:choose_period_to_delete",
      data: { ddMm, periodCount: periods.length },
    });
    await ctx.reply(t("edit.promptChoosePeriodToDelete", { max: periods.length }), {
      parse_mode: "Markdown",
    });
    return;
  }

  const [period] = periods;
  const range = `${formatTime(period.startTime, timezone)}–${
    period.endTime ? formatTime(period.endTime, timezone) : "now"
  }`;
  const recordType = record?.recordType;
  const prompt =
    recordType && isAbsenceRecordType(recordType)
      ? t("edit.confirmDeleteLastPeriodHalfDay", {
          range,
          date: ddMm,
          absenceLabel: t(`absenceType.${recordType}`),
        })
      : t("edit.confirmDeleteLastPeriod", { range, date: ddMm });

  SessionStore.set(userId, { step: "edit:confirm_delete_last_period", data: { ddMm } });
  await ctx.reply(prompt, { parse_mode: "Markdown" });
}

/** Deletes work period `periodNumber` of `ddMm`, ends the conversation and replies with the day's result. */
async function deletePeriodAndReply(
  ctx: Context,
  userId: string,
  ddMm: string,
  periodNumber: number
): Promise<void> {
  SessionStore.clear(userId);
  try {
    const settings = await getSettingsOrThrow(userId);
    const result = await removeWorkPeriod(userId, ddMm, periodNumber);
    const message =
      result === null
        ? t("edit.periodDeletedNoRecord", { date: ddMm })
        : formatPeriodsSaved(
            result,
            t("edit.titlePeriodDeleted", { periodNumber }),
            settings.timezone
          );
    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (err) {
    await handleBotError(ctx, err);
  }
}

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
      const { ddMm, editMenu, periodCount = 0 } = session.data;
      if (!ddMm || !editMenu) { SessionStore.clear(userId); return; }

      const choice = parseChoice(text, editMenu.length);
      if (choice === null) {
        await ctx.reply(t("edit.invalidChoice", { maxChoice: editMenu.length }), { parse_mode: "Markdown" });
        return;
      }
      const action = editMenu[choice - 1] as EditAction;

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
      } else if (action === "ADD_PERIOD") {
        SessionStore.set(userId, { step: "edit:add_period", data: { ddMm } });
        await ctx.reply(t("edit.promptAddPeriod"), { parse_mode: "Markdown" });
      } else if (action === "EDIT_PERIOD") {
        // With a single period there's nothing to choose — go straight to its times.
        if (periodCount === 1) {
          SessionStore.set(userId, { step: "edit:edit_period", data: { ddMm, periodNumber: 1 } });
          await ctx.reply(t("edit.promptEditOnlyPeriod"), { parse_mode: "Markdown" });
        } else {
          SessionStore.set(userId, { step: "edit:choose_period_to_edit", data: { ddMm, periodCount } });
          await ctx.reply(t("edit.promptChoosePeriodToEdit", { max: periodCount }), { parse_mode: "Markdown" });
        }
      } else if (action === "DELETE_PERIOD") {
        if (periodCount === 1) {
          // Deleting the only period empties the day — confirm first.
          await askToConfirmDeletingLastPeriod(ctx, userId, ddMm);
        } else {
          SessionStore.set(userId, { step: "edit:choose_period_to_delete", data: { ddMm, periodCount } });
          await ctx.reply(t("edit.promptChoosePeriodToDelete", { max: periodCount }), { parse_mode: "Markdown" });
        }
      } else if (action === "MARK_ABSENCE") {
        SessionStore.set(userId, { step: "edit:choose_absence", data: { ddMm } });
        await ctx.reply(t("edit.absenceTypeList"), { parse_mode: "Markdown" });
      }
      break;
    }

    case "edit:add_period": {
      const { ddMm } = session.data;
      if (!ddMm) { SessionStore.clear(userId); return; }

      const match = HH_MM_RANGE_RE.exec(text);
      if (!match) {
        await ctx.reply(t("edit.invalidTimeRangeFormat", { example: "15:00-18:30" }), { parse_mode: "Markdown" });
        return;
      }

      const [, startHhMm, endHhMm] = match;
      await saveTimes(ctx, userId, async () => {
        const settings = await getSettingsOrThrow(userId);
        const result = await addWorkPeriod(userId, ddMm, startHhMm, endHhMm);
        return formatPeriodsSaved(result, t("edit.titlePeriodAdded"), settings.timezone);
      });
      break;
    }

    case "edit:choose_period_to_edit":
    case "edit:choose_period_to_delete": {
      const { ddMm, periodCount } = session.data;
      if (!ddMm || !periodCount) { SessionStore.clear(userId); return; }

      const periodNumber = parseChoice(text, periodCount);
      if (periodNumber === null) {
        await ctx.reply(t("edit.invalidChoosePeriod", { max: periodCount }), { parse_mode: "Markdown" });
        return;
      }

      if (session.step === "edit:choose_period_to_edit") {
        SessionStore.set(userId, { step: "edit:edit_period", data: { ddMm, periodNumber } });
        await ctx.reply(t("edit.promptEditPeriod", { periodNumber }), { parse_mode: "Markdown" });
        break;
      }

      await deletePeriodAndReply(ctx, userId, ddMm, periodNumber);
      break;
    }

    case "edit:confirm_delete_last_period": {
      const { ddMm } = session.data;
      if (!ddMm) { SessionStore.clear(userId); return; }

      if (text.trim().toLowerCase() === "yes") {
        await deletePeriodAndReply(ctx, userId, ddMm, 1);
      } else {
        SessionStore.clear(userId);
        await ctx.reply(t("edit.cancelled"), { parse_mode: "Markdown" });
      }
      break;
    }

    case "edit:edit_period": {
      const { ddMm, periodNumber } = session.data;
      if (!ddMm || !periodNumber) { SessionStore.clear(userId); return; }

      const match = HH_MM_RANGE_RE.exec(text);
      if (!match) {
        await ctx.reply(t("edit.invalidTimeRangeFormat", { example: "15:00-18:30" }), { parse_mode: "Markdown" });
        return;
      }

      const [, startHhMm, endHhMm] = match;
      await saveTimes(ctx, userId, async () => {
        const settings = await getSettingsOrThrow(userId);
        const result = await editWorkPeriod(userId, ddMm, periodNumber, startHhMm, endHhMm);
        return formatPeriodsSaved(
          result,
          t("edit.titlePeriodUpdated", { periodNumber }),
          settings.timezone
        );
      });
      break;
    }

    case "edit:set_end_hour": {
      const { ddMm } = session.data;
      if (!ddMm) { SessionStore.clear(userId); return; }

      if (!HH_MM_RE.test(text)) {
        await ctx.reply(t("edit.invalidTimeFormat"), { parse_mode: "Markdown" });
        return;
      }

      await saveTimes(ctx, userId, async () => {
        const settings = await getSettingsOrThrow(userId);
        const result = await setEndHour(userId, ddMm, text);

        // Several periods → list them all; one → the Start/End layout.
        if (result.periods.length > 1) {
          return formatPeriodsSaved(result, t("edit.titleEndHourSaved"), settings.timezone);
        }
        const startStr = formatTime(result.startTime!, settings.timezone);
        const endStr = formatTime(result.endTime!, settings.timezone);
        const workedStr = formatMinutesAsDuration(result.workedMinutes);
        const balanceStr = formatBalance(result.balanceMinutes);
        return t("edit.endHourSaved", { date: ddMm, startStr, endStr, workedStr, balanceStr });
      });
      break;
    }

    case "edit:set_start_end": {
      const { ddMm } = session.data;
      if (!ddMm) { SessionStore.clear(userId); return; }

      const match = HH_MM_RANGE_RE.exec(text);
      if (!match) {
        await ctx.reply(t("edit.invalidTimeRangeFormat", { example: "08:15-17:30" }), { parse_mode: "Markdown" });
        return;
      }

      const [, startHhMm, endHhMm] = match;
      await saveTimes(ctx, userId, async () => {
        const settings = await getSettingsOrThrow(userId);
        const result = await setStartAndEndHours(userId, ddMm, startHhMm, endHhMm);
        const startStr = formatTime(result.startTime!, settings.timezone);
        const endStr = formatTime(result.endTime!, settings.timezone);
        const workedStr = formatMinutesAsDuration(result.workedMinutes);
        const balanceStr = formatBalance(result.balanceMinutes);

        return appendLeaveAdjustmentLines(
          t("edit.startEndSaved", { date: ddMm, startStr, endStr, workedStr, balanceStr }),
          result
        );
      });
      break;
    }

    case "edit:log_hours": {
      const { ddMm } = session.data;
      if (!ddMm) { SessionStore.clear(userId); return; }

      const match = HH_MM_RANGE_RE.exec(text);
      if (!match) {
        await ctx.reply(t("edit.invalidTimeRangeFormat", { example: "13:00-17:30" }), { parse_mode: "Markdown" });
        return;
      }

      const [, startHhMm, endHhMm] = match;
      await saveTimes(ctx, userId, async () => {
        const settings = await getSettingsOrThrow(userId);
        const result = await setHoursOnHalfDay(userId, ddMm, startHhMm, endHhMm);

        return t("edit.halfDayHoursSaved", {
          date: ddMm,
          absenceLabel: t(`absenceType.${result.recordType}`),
          creditedStr: formatMinutesAsDuration(result.creditedMinutes),
          startStr: formatTime(result.startTime!, settings.timezone),
          endStr: formatTime(result.endTime!, settings.timezone),
          workedStr: formatMinutesAsDuration(result.workedMinutes),
          balanceStr: formatBalance(result.balanceMinutes),
        });
      });
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

/**
 * Starts the /edit conversation: remembers the menu shown (`editMenu`, in
 * order) and how many work periods the date has, then sends `prompt`.
 */
export async function startEditFlow(
  ctx: Context,
  userId: string,
  ddMm: string,
  editMenu: EditAction[],
  periodCount: number,
  prompt: string
): Promise<void> {
  SessionStore.set(userId, { step: "edit:choose_action", data: { ddMm, editMenu, periodCount } });
  await ctx.reply(prompt, { parse_mode: "Markdown" });
}
