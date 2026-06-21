import type { Context } from "telegraf";
import { AppError } from "@/utils/AppError";
import type { LanguageCode } from "@shared/types/CoreTypes";
import { t } from "@/localization/LocalizationService";

/**
 * Handles any error thrown by a service call inside a bot command handler.
 * Replies to the user with a friendly Markdown message in their language.
 *
 * Pass `lang` when it is already known (fetched settings). Defaults to "en".
 */
export async function handleBotError(
  ctx: Context,
  err: unknown,
  lang: LanguageCode = "en"
): Promise<void> {
  if (err instanceof AppError) {
    const msgs = t(lang).errors;
    let msg: string;

    switch (err.code) {
      case "USER_SETTINGS_NOT_FOUND":
        msg = msgs.userSettingsNotFound;
        break;
      case "DAILY_RECORD_ALREADY_EXISTS":
        msg = msgs.dailyRecordAlreadyExists;
        break;
      case "ACTIVE_RECORD_NOT_FOUND":
        msg = msgs.activeRecordNotFound;
        break;
      case "DAILY_RECORD_ALREADY_CLOSED":
        msg = msgs.dailyRecordAlreadyClosed;
        break;
      case "PREVIOUS_RECORD_STILL_OPEN":
        msg = msgs.previousRecordStillOpen(err.message);
        break;
      case "SETUP_ALREADY_COMPLETED":
        msg = msgs.setupAlreadyCompleted;
        break;
      case "VALIDATION_ERROR":
      case "INVALID_DATE_FORMAT":
      case "INVALID_TIME_FORMAT":
      case "INVALID_TIME_RANGE":
      case "INVALID_RECORD_TYPE":
        msg = msgs.validationError(err.message);
        break;
      default:
        msg = msgs.unknown;
    }

    await ctx.reply(msg, { parse_mode: "Markdown" });
    return;
  }

  console.error("Unhandled bot error:", err);
  await ctx.reply("❌ An unexpected error occurred. Please try again later.");
}
