import bot from "@/bot/Bot";
import { handleSetup } from "@/bot/handlers/SetupCommandHandler";
import { handleStart } from "@/bot/handlers/StartCommandHandler";
import { handleStatus } from "@/bot/handlers/StatusCommandHandler";
import { handleEnd } from "@/bot/handlers/EndCommandHandler";
import { handleWeek } from "@/bot/handlers/WeekCommandHandler";
import { handleMonth } from "@/bot/handlers/MonthCommandHandler";

/**
 * Registers all Telegram command handlers on the bot instance.
 * Call this once during bootstrap, before bot.launch().
 */
export function registerCommands(): void {
  bot.command("setup", handleSetup);
  bot.command("start", handleStart);
  bot.command("status", handleStatus);
  bot.command("end", handleEnd);
  bot.command("week", handleWeek);
  bot.command("month", handleMonth);
}
