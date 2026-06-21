import type { MessageCatalog } from "@/localization/MessageCatalog";

const he: MessageCatalog = {
  weekdayNames: {
    0: "ראשון",
    1: "שני",
    2: "שלישי",
    3: "רביעי",
    4: "חמישי",
    5: "שישי",
    6: "שבת",
  },

  absenceTypeNames: {
    SICK: "מחלה",
    VACATION: "חופשה",
    HOLIDAY: "חג",
    HOLIDAY_EVE: "ערב חג",
    UNPAID_ABSENCE: "היעדרות ללא תשלום",
    ELECTION: "יום בחירות",
  },

  // ── /start ────────────────────────────────────────────────────────────────

  workdayStarted({ startStr, endStr, durationStr }) {
    return [
      "▶️ *יום עבודה התחיל!*",
      "",
      `🕐 שעת התחלה:  *${startStr}*`,
      `🏁 סיום צפוי:  *${endStr}*`,
      `⏱ נדרש:        *${durationStr}*`,
      "",
      "השתמש ב-/status לבדיקת ההתקדמות, או /end כשסיימת.",
    ].join("\n");
  },

  // ── /status ───────────────────────────────────────────────────────────────

  todayStatus({ workDate, startStr, endStr, workedStr, remainingStr, requiredStr, balanceStr, goalReached }) {
    const lines = [
      "📊 *סטטוס היום*",
      "",
      `🗓 תאריך:        *${workDate}*`,
      `🕐 התחלה:        *${startStr}*`,
      `🏁 סיום צפוי:    *${endStr}*`,
      "",
      `✅ עבדת:         *${workedStr}* / ${requiredStr}`,
      `⏳ נותר:         *${remainingStr}*`,
      `⚖️ מאזן:         *${balanceStr}*`,
    ];
    if (goalReached) {
      lines.push("", "🎉 הגעת ליעד היומי! השתמש ב-/end כשסיימת, או /edit dd-mm לתיקון תאריך.");
    } else {
      lines.push("", "השתמש ב-/end לסיום יום העבודה, או /edit dd-mm לתיקון תאריך.");
    }
    return lines.join("\n");
  },

  // ── /end ──────────────────────────────────────────────────────────────────

  workdayEnded({ workDate, startStr, endStr, workedStr, requiredStr, balanceStr, balancePositive }) {
    const balanceEmoji = balancePositive ? "🟢" : "🔴";
    return [
      "⏹ *יום עבודה הסתיים!*",
      "",
      `🗓 תאריך:    *${workDate}*`,
      `🕐 התחלה:    *${startStr}*`,
      `🏁 סיום:     *${endStr}*`,
      "",
      `✅ עבדת:     *${workedStr}*`,
      `📋 נדרש:     *${requiredStr}*`,
      `${balanceEmoji} מאזן:      *${balanceStr}*`,
      "",
      "השתמש ב-/week או /month לצפייה בסיכום.",
    ].join("\n");
  },

  // ── /week ─────────────────────────────────────────────────────────────────

  weekSummary({ startDate, endDate, workdaysCount, requiredStr, workedStr, balanceStr, balancePositive }) {
    const balanceEmoji = balancePositive ? "🟢" : "🔴";
    return [
      "📅 *סיכום שבועי*",
      `📆 תקופה: *${startDate}* → *${endDate}*`,
      "",
      `📋 ימי עבודה:  *${workdaysCount}*`,
      `⏱ נדרש:       *${requiredStr}*`,
      `✅ עבדת:       *${workedStr}*`,
      `${balanceEmoji} מאזן:      *${balanceStr}*`,
    ].join("\n");
  },

  // ── /month ────────────────────────────────────────────────────────────────

  monthSummary({ month, workdaysCount, requiredStr, workedStr, balanceStr, balancePositive }) {
    const balanceEmoji = balancePositive ? "🟢" : "🔴";
    return [
      "🗓 *סיכום חודשי*",
      `📆 חודש: *${month}*`,
      "",
      `📋 ימי עבודה:  *${workdaysCount}*`,
      `⏱ נדרש:       *${requiredStr}*`,
      `✅ עבדת:       *${workedStr}*`,
      `${balanceEmoji} מאזן:      *${balanceStr}*`,
    ].join("\n");
  },

  // ── /settings ─────────────────────────────────────────────────────────────

  settingsDisplay({ dailyHoursStr, workdaysStr, timezone, languageLabel }) {
    return [
      "⚙️ *ההגדרות הנוכחיות שלך*",
      "",
      `📋 שעות יומיות:  *${dailyHoursStr}*`,
      `📅 ימי עבודה:    *${workdaysStr}*`,
      `🌍 אזור זמן:     *${timezone}*`,
      `🗣 שפה:          *${languageLabel}*`,
    ].join("\n");
  },

  // ── /setup already completed ──────────────────────────────────────────────

  setupAlreadyCompleted({ dailyHoursStr, workdaysStr, timezone, languageLabel }) {
    return [
      "✅ *ההגדרות כבר הוגדרו.*",
      "",
      "ההגדרות הנוכחיות:",
      `  שעות יומיות: ${dailyHoursStr}`,
      `  ימי עבודה:   ${workdaysStr}`,
      `  אזור זמן:    ${timezone}`,
      `  שפה:         ${languageLabel}`,
      "",
      "כדי לשנות הגדרות, השתמש ב:",
      "/settings\\_edit",
    ].join("\n");
  },

  // ── /help ─────────────────────────────────────────────────────────────────

  help: [
    "📖 *WorkHours Bot — פקודות זמינות*",
    "",
    "/start          — התחל את יום העבודה של היום",
    "/status         — הצג את הסטטוס הנוכחי",
    "/end            — סיים את יום העבודה של היום",
    "/edit dd-mm     — ערוך או תקן תאריך ספציפי",
    "/week           — הצג סיכום שבועי",
    "/month          — הצג סיכום חודשי",
    "/settings       — הצג הגדרות נוכחיות",
    "/settings\\_edit — ערוך הגדרות",
    "/help           — הצג הודעה זו",
  ].join("\n"),

  // ── /edit dd-mm — state prompts ───────────────────────────────────────────

  editDayOpenRecord({ date }) {
    return [
      `📋 *${date} — יום עבודה פתוח*`,
      "",
      "מה ברצונך לעשות?",
      "",
      "1. הגדר שעת סיום",
      "2. הגדר שעות התחלה וסיום",
      "3. סמן היעדרות",
      "4. בטל",
    ].join("\n");
  },

  editDayNoRecord({ date }) {
    return [
      `📋 *לא נמצאה רשומה עבור ${date}*`,
      "",
      "מה ברצונך לעשות?",
      "",
      "1. הגדר שעות התחלה וסיום",
      "2. סמן היעדרות",
      "3. בטל",
    ].join("\n");
  },

  editDayClosedRecord({ date }) {
    return [
      `📋 *${date} — רשומת עבודה מלאה*`,
      "",
      "מה ברצונך לעשות?",
      "",
      "1. עדכן שעות התחלה וסיום",
      "2. סמן היעדרות במקום",
      "3. בטל",
    ].join("\n");
  },

  editDayAbsenceRecord({ date, absenceLabel }) {
    return [
      `📋 *${date} — מסומן כ-${absenceLabel}*`,
      "",
      "מה ברצונך לעשות?",
      "",
      "1. הגדר שעות התחלה וסיום במקום",
      "2. שנה סוג היעדרות",
      "3. בטל",
    ].join("\n");
  },

  // ── /edit dd-mm — input prompts ───────────────────────────────────────────

  editPromptEndHour: [
    "הזן שעת סיום:",
    "",
    "דוגמה: 17:30",
  ].join("\n"),

  editPromptStartAndEndHours: [
    "הזן שעות התחלה וסיום:",
    "",
    "דוגמה: 08:15-17:30",
  ].join("\n"),

  editAbsenceTypeList: [
    "בחר סוג היעדרות:",
    "",
    "1. מחלה",
    "2. חופשה",
    "3. חג",
    "4. ערב חג",
    "5. היעדרות ללא תשלום",
    "6. יום בחירות",
  ].join("\n"),

  // ── /edit dd-mm — success replies ────────────────────────────────────────

  editEndHourSaved({ date, startStr, endStr, workedStr, balanceStr }) {
    return [
      "✅ *שעת הסיום נשמרה*",
      "",
      `📅 תאריך:    *${date}*`,
      `🕐 התחלה:   *${startStr}*`,
      `🏁 סיום:    *${endStr}*`,
      `✅ עבדת:    *${workedStr}*`,
      `⚖️ מאזן:    *${balanceStr}*`,
    ].join("\n");
  },

  editStartEndSaved({ date, startStr, endStr, workedStr, balanceStr }) {
    return [
      "✅ *שעות ההתחלה והסיום נשמרו*",
      "",
      `📅 תאריך:    *${date}*`,
      `🕐 התחלה:   *${startStr}*`,
      `🏁 סיום:    *${endStr}*`,
      `✅ עבדת:    *${workedStr}*`,
      `⚖️ מאזן:    *${balanceStr}*`,
    ].join("\n");
  },

  editAbsenceSaved({ date, absenceLabel, creditedStr, balanceStr }) {
    return [
      `✅ *${absenceLabel} נשמר*`,
      "",
      `📅 תאריך:       *${date}*`,
      `⏱ נחשב כ:      *${creditedStr}*`,
      `⚖️ מאזן:        *${balanceStr}*`,
    ].join("\n");
  },

  editCancelled: "↩️ בוטל.",

  // ── Errors ────────────────────────────────────────────────────────────────

  errors: {
    userSettingsNotFound:
      "⚙️ *עדיין לא הגדרת את החשבון שלך.*\n\n" +
      "הפעל /setup כדי להתחיל.",

    dailyRecordAlreadyExists:
      "⚠️ *כבר התחלת את יום העבודה של היום.*\n\n" +
      "השתמש ב-/status לבדיקת ההתקדמות, או /end כשסיימת.",

    activeRecordNotFound:
      "⚠️ *לא נמצא יום עבודה פעיל.*\n\n" +
      "השתמש ב-/start כדי להתחיל את היום, או /edit dd-mm לתיקון תאריך.",

    dailyRecordAlreadyClosed:
      "⚠️ *יום העבודה של היום כבר נסגר.*\n\n" +
      "השתמש ב-/status לצפייה ברשומה, או /week לסיכום שבועי.",

    previousRecordStillOpen: (message) =>
      `⚠️ *יש לך יום עבודה לא מושלם.*\n\n${message}\n\n` +
      "_השתמש ב-/edit dd-mm לתיקון._",

    setupAlreadyCompleted:
      "✅ *ההגדרות כבר הוגדרו.*\n\n" +
      "השתמש ב-/settings לצפייה בהגדרות, או /settings\\_edit לשינוי.",

    validationError: (message) =>
      `❌ *קלט לא תקין.*\n\n${message}`,

    unknown:
      "❌ *משהו השתבש.* אנא נסה שוב מאוחר יותר.",
  },
};

export default he;
