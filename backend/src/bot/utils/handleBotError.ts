import type { Context } from "telegraf";
import { AppError } from "@/utils/AppError";
import { t } from "@/i18n";

/**
 * Handles any error thrown by a service call inside a bot command handler.
 * Replies to the user with a friendly Markdown message sourced from botLabels.json.
 */
export async function handleBotError(ctx: Context, err: unknown): Promise<void> {
  if (err instanceof AppError) {
    let msg: string;

    switch (err.code) {
      case "USER_SETTINGS_NOT_FOUND":
        msg = t("errors.userSettingsNotFound");
        break;
      case "DAILY_RECORD_ALREADY_EXISTS":
        msg = t("errors.dailyRecordAlreadyExists");
        break;
      case "ACTIVE_RECORD_NOT_FOUND":
        msg = t("errors.activeRecordNotFound");
        break;
      case "DAILY_RECORD_ALREADY_CLOSED":
        msg = t("errors.dailyRecordAlreadyClosed");
        break;
      case "PREVIOUS_RECORD_STILL_OPEN":
        msg = t("errors.previousRecordStillOpen", { message: err.message });
        break;
      case "SETUP_ALREADY_COMPLETED":
        msg = t("errors.setupAlreadyCompleted");
        break;
      case "VALIDATION_ERROR":
      case "INVALID_DATE_FORMAT":
      case "INVALID_TIME_FORMAT":
      case "INVALID_TIME_RANGE":
      case "INVALID_RECORD_TYPE":
        msg = t("errors.validationError", { message: err.message });
        break;
      default:
        msg = t("errors.unknown");
    }

    await ctx.reply(msg, { parse_mode: "Markdown" }).catch(() => undefined);
    return;
  }

  console.error("Unhandled bot error:", err);
  await ctx.reply(t("errors.unknown"), { parse_mode: "Markdown" }).catch(() => undefined);
}
