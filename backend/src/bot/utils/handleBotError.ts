import type { Context } from "telegraf";
import { AppError } from "@/utils/AppError";

/**
 * Maps every known AppError code to a user-friendly Telegram message that
 * explains what went wrong *and* tells the user what to do next.
 */
function errorMessage(err: AppError): string {
  switch (err.code) {
    // ── Settings ────────────────────────────────────────────────────────────
    case "USER_SETTINGS_NOT_FOUND":
      return (
        "⚙️ *You haven't configured your account yet.*\n\n" +
        "Run `/setup <daily_hours>` to get started.\n" +
        "_Example: `/setup 8` or `/setup 7.5 Europe/Berlin 1,2,3,4,5`_"
      );

    // ── Workday lifecycle ────────────────────────────────────────────────────
    case "DAILY_RECORD_ALREADY_EXISTS":
      return (
        "⚠️ *You've already started today's workday.*\n\n" +
        "Use `/status` to check your progress or `/end` when you're done."
      );

    case "ACTIVE_RECORD_NOT_FOUND":
      return (
        "⚠️ *No active workday found.*\n\n" +
        "Use `/start` to begin your day, then `/status` to track your progress."
      );

    case "DAILY_RECORD_ALREADY_CLOSED":
      return (
        "⚠️ *Today's workday is already closed.*\n\n" +
        "Use `/status` to review today's record or `/week` to see your weekly summary."
      );

    // ── Cross-day edge cases ─────────────────────────────────────────────────
    case "PREVIOUS_RECORD_STILL_OPEN":
      return (
        `⚠️ *You have an unfinished workday.*\n\n` +
        `${err.message}\n\n` +
        "_Close it first, then you can start a new day or view summaries._"
      );

    // ── Input validation ─────────────────────────────────────────────────────
    case "VALIDATION_ERROR":
      return `❌ *Invalid input.*\n\n${err.message}`;

    // ── Fallback ─────────────────────────────────────────────────────────────
    default:
      return "❌ *Something went wrong.* Please try again later.";
  }
}

/**
 * Handles any error thrown by a service call inside a bot command handler.
 * Replies to the user with a friendly Markdown message; logs unexpected errors.
 */
export async function handleBotError(
  ctx: Context,
  err: unknown
): Promise<void> {
  if (err instanceof AppError) {
    await ctx.reply(errorMessage(err), { parse_mode: "Markdown" });
    return;
  }
  console.error("Unhandled bot error:", err);
  await ctx.reply("❌ An unexpected error occurred. Please try again later.");
}
