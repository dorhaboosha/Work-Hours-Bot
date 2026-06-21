import type { MessageCatalog } from "@/localization/MessageCatalog";

const en: MessageCatalog = {
  weekdayNames: {
    0: "Sunday",
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday",
  },

  absenceTypeNames: {
    SICK: "Sick day",
    VACATION: "Vacation day",
    HOLIDAY: "Holiday",
    HOLIDAY_EVE: "Holiday eve",
    UNPAID_ABSENCE: "Unpaid absence",
    ELECTION: "Election day",
  },

  // ── /start ────────────────────────────────────────────────────────────────

  workdayStarted({ startStr, endStr, durationStr }) {
    return [
      "▶️ *Workday started!*",
      "",
      `🕐 Start time:    *${startStr}*`,
      `🏁 Expected end:  *${endStr}*`,
      `⏱ Required:       *${durationStr}*`,
      "",
      "Use /status to check your progress, or /end when you're done.",
    ].join("\n");
  },

  // ── /status ───────────────────────────────────────────────────────────────

  todayStatus({ workDate, startStr, endStr, workedStr, remainingStr, requiredStr, balanceStr, goalReached }) {
    const lines = [
      "📊 *Today's status*",
      "",
      `🗓 Date:         *${workDate}*`,
      `🕐 Start:        *${startStr}*`,
      `🏁 Expected end: *${endStr}*`,
      "",
      `✅ Worked:       *${workedStr}* / ${requiredStr}`,
      `⏳ Remaining:    *${remainingStr}*`,
      `⚖️ Balance:      *${balanceStr}*`,
    ];
    if (goalReached) {
      lines.push("", "🎉 You've reached your daily goal! Use /end when you're done, or /edit dd-mm to fix a past date.");
    } else {
      lines.push("", "Use /end to close your workday when you're done, or /edit dd-mm to fix a past date.");
    }
    return lines.join("\n");
  },

  // ── /end ──────────────────────────────────────────────────────────────────

  workdayEnded({ workDate, startStr, endStr, workedStr, requiredStr, balanceStr, balancePositive }) {
    const balanceEmoji = balancePositive ? "🟢" : "🔴";
    return [
      "⏹ *Workday ended!*",
      "",
      `🗓 Date:       *${workDate}*`,
      `🕐 Start:      *${startStr}*`,
      `🏁 End:        *${endStr}*`,
      "",
      `✅ Worked:     *${workedStr}*`,
      `📋 Required:   *${requiredStr}*`,
      `${balanceEmoji} Balance:    *${balanceStr}*`,
      "",
      "Use /week or /month to view your summary.",
    ].join("\n");
  },

  // ── /week ─────────────────────────────────────────────────────────────────

  weekSummary({ startDate, endDate, workdaysCount, requiredStr, workedStr, balanceStr, balancePositive }) {
    const balanceEmoji = balancePositive ? "🟢" : "🔴";
    return [
      "📅 *Weekly summary*",
      `📆 Period: *${startDate}* → *${endDate}*`,
      "",
      `📋 Workdays:  *${workdaysCount}*`,
      `⏱ Required:  *${requiredStr}*`,
      `✅ Worked:    *${workedStr}*`,
      `${balanceEmoji} Balance:   *${balanceStr}*`,
    ].join("\n");
  },

  // ── /month ────────────────────────────────────────────────────────────────

  monthSummary({ month, workdaysCount, requiredStr, workedStr, balanceStr, balancePositive }) {
    const balanceEmoji = balancePositive ? "🟢" : "🔴";
    return [
      "🗓 *Monthly summary*",
      `📆 Month: *${month}*`,
      "",
      `📋 Workdays:  *${workdaysCount}*`,
      `⏱ Required:  *${requiredStr}*`,
      `✅ Worked:    *${workedStr}*`,
      `${balanceEmoji} Balance:   *${balanceStr}*`,
    ].join("\n");
  },

  // ── /settings ─────────────────────────────────────────────────────────────

  settingsDisplay({ dailyHoursStr, workdaysStr, timezone, languageLabel }) {
    return [
      "⚙️ *Your current settings*",
      "",
      `📋 Daily hours:  *${dailyHoursStr}*`,
      `📅 Workdays:     *${workdaysStr}*`,
      `🌍 Timezone:     *${timezone}*`,
      `🗣 Language:     *${languageLabel}*`,
    ].join("\n");
  },

  // ── /setup already completed ──────────────────────────────────────────────

  setupAlreadyCompleted({ dailyHoursStr, workdaysStr, timezone, languageLabel }) {
    return [
      "✅ *Setup is already complete.*",
      "",
      "Current settings:",
      `  Daily hours: ${dailyHoursStr}`,
      `  Workdays:    ${workdaysStr}`,
      `  Timezone:    ${timezone}`,
      `  Language:    ${languageLabel}`,
      "",
      "To change your settings, use:",
      "/settings\\_edit",
    ].join("\n");
  },

  // ── /help ─────────────────────────────────────────────────────────────────

  help: [
    "📖 *WorkHours Bot — Available commands*",
    "",
    "/start          — Start today's workday",
    "/status         — Show today's active status",
    "/end            — End today's active workday",
    "/edit dd-mm     — Edit or fix a specific date",
    "/week           — Show current week summary",
    "/month          — Show current month summary",
    "/settings       — Show current settings",
    "/settings\\_edit — Edit settings",
    "/help           — Show this message",
  ].join("\n"),

  // ── /edit dd-mm — state prompts ───────────────────────────────────────────

  editDayOpenRecord({ date }) {
    return [
      `📋 *${date} — open workday*`,
      "",
      "What do you want to do?",
      "",
      "1. Set end hour",
      "2. Set start and end hours",
      "3. Mark absence",
      "4. Cancel",
    ].join("\n");
  },

  editDayNoRecord({ date }) {
    return [
      `📋 *No record found for ${date}*`,
      "",
      "What do you want to do?",
      "",
      "1. Set start and end hours",
      "2. Mark absence",
      "3. Cancel",
    ].join("\n");
  },

  editDayClosedRecord({ date }) {
    return [
      `📋 *${date} — completed work record*`,
      "",
      "What do you want to do?",
      "",
      "1. Update start and end hours",
      "2. Mark absence instead",
      "3. Cancel",
    ].join("\n");
  },

  editDayAbsenceRecord({ date, absenceLabel }) {
    return [
      `📋 *${date} — marked as ${absenceLabel}*`,
      "",
      "What do you want to do?",
      "",
      "1. Set start and end hours instead",
      "2. Change absence type",
      "3. Cancel",
    ].join("\n");
  },

  // ── /edit dd-mm — input prompts ───────────────────────────────────────────

  editPromptEndHour: [
    "Enter end time:",
    "",
    "Example: 17:30",
  ].join("\n"),

  editPromptStartAndEndHours: [
    "Enter start and end time:",
    "",
    "Example: 08:15-17:30",
  ].join("\n"),

  editAbsenceTypeList: [
    "Choose absence type:",
    "",
    "1. Sick day",
    "2. Vacation day",
    "3. Holiday",
    "4. Holiday eve",
    "5. Unpaid absence",
    "6. Election day",
  ].join("\n"),

  // ── /edit dd-mm — success replies ────────────────────────────────────────

  editEndHourSaved({ date, startStr, endStr, workedStr, balanceStr }) {
    return [
      "✅ *End hour saved*",
      "",
      `📅 Date:    *${date}*`,
      `🕐 Start:   *${startStr}*`,
      `🏁 End:     *${endStr}*`,
      `✅ Worked:  *${workedStr}*`,
      `⚖️ Balance: *${balanceStr}*`,
    ].join("\n");
  },

  editStartEndSaved({ date, startStr, endStr, workedStr, balanceStr }) {
    return [
      "✅ *Start and end hours saved*",
      "",
      `📅 Date:    *${date}*`,
      `🕐 Start:   *${startStr}*`,
      `🏁 End:     *${endStr}*`,
      `✅ Worked:  *${workedStr}*`,
      `⚖️ Balance: *${balanceStr}*`,
    ].join("\n");
  },

  editAbsenceSaved({ date, absenceLabel, creditedStr, balanceStr }) {
    return [
      `✅ *${absenceLabel} saved*`,
      "",
      `📅 Date:       *${date}*`,
      `⏱ Counted as: *${creditedStr}*`,
      `⚖️ Balance:    *${balanceStr}*`,
    ].join("\n");
  },

  editCancelled: "↩️ Cancelled.",

  // ── Errors ────────────────────────────────────────────────────────────────

  errors: {
    userSettingsNotFound:
      "⚙️ *You haven't configured your account yet.*\n\n" +
      "Run `/setup` to get started.",

    dailyRecordAlreadyExists:
      "⚠️ *You've already started today's workday.*\n\n" +
      "Use `/status` to check your progress or `/end` when you're done.",

    activeRecordNotFound:
      "⚠️ *No active workday found.*\n\n" +
      "Use `/start` to begin your day, or `/edit dd-mm` to log or fix a past date.",

    dailyRecordAlreadyClosed:
      "⚠️ *Today's workday is already closed.*\n\n" +
      "Use `/status` to review today's record or `/week` to see your weekly summary.",

    previousRecordStillOpen: (message) =>
      `⚠️ *You have an unfinished workday.*\n\n${message}\n\n` +
      "_Use `/edit dd-mm` to fix it, then you can start a new day or view summaries._",

    setupAlreadyCompleted:
      "✅ *Setup is already complete.*\n\n" +
      "Use `/settings` to view your settings or `/settings\\_edit` to change them.",

    validationError: (message) =>
      `❌ *Invalid input.*\n\n${message}`,

    unknown:
      "❌ *Something went wrong.* Please try again later.",
  },
};

export default en;
