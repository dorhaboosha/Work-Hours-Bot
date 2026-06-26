import type { Context } from "telegraf";
import { AppError } from "@/utils/AppError";
import { t } from "@/i18n";

/**
 * Handles any error thrown by a service call inside a bot command handler.
 * Replies to the user with a friendly Markdown message sourced from botLabels.json.
 */
export async function handleBotError(
  ctx: Context,
  err: unknown,
  lang = "en"
): Promise<void> {
  if (err instanceof AppError) {
    let msg: string;

    switch (err.code) {
      case "USER_SETTINGS_NOT_FOUND":
        msg = t("errors.userSettingsNotFound", lang);
        break;
      case "DAILY_RECORD_ALREADY_EXISTS":
        msg = t("errors.dailyRecordAlreadyExists", lang);
        break;
      case "ACTIVE_RECORD_NOT_FOUND":
        msg = t("errors.activeRecordNotFound", lang);
        break;
      case "DAILY_RECORD_ALREADY_CLOSED":
        msg = t("errors.dailyRecordAlreadyClosed", lang);
        break;
      case "PREVIOUS_RECORD_STILL_OPEN":
        msg = t("errors.previousRecordStillOpen", lang, { message: err.message });
        break;
      case "SETUP_ALREADY_COMPLETED":
        msg = t("errors.setupAlreadyCompleted", lang);
        break;
      case "VALIDATION_ERROR":
      case "INVALID_DATE_FORMAT":
      case "INVALID_TIME_FORMAT":
      case "INVALID_TIME_RANGE":
      case "INVALID_RECORD_TYPE":
        msg = t("errors.validationError", lang, { message: err.message });
        break;
      default:
        msg = t("errors.unknown", lang);
    }

    await ctx.reply(msg, { parse_mode: "Markdown" });
    return;
  }

  console.error("Unhandled bot error:", err);
  await ctx.reply("❌ An unexpected error occurred. Please try again later.");
}
