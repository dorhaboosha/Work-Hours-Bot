import bot from "@/bot/Bot";
import { handleSetup } from "@/bot/handlers/SetupCommandHandler";
import { handleSettings } from "@/bot/handlers/SettingsCommandHandler";
import { handleSettingsEdit } from "@/bot/handlers/SettingsEditCommandHandler";
import { handleStart } from "@/bot/handlers/StartCommandHandler";
import { handleStatus } from "@/bot/handlers/StatusCommandHandler";
import { handleEnd } from "@/bot/handlers/EndCommandHandler";
import { handleEdit } from "@/bot/handlers/EditCommandHandler";
import { handleWeek } from "@/bot/handlers/WeekCommandHandler";
import { handleMonth } from "@/bot/handlers/MonthCommandHandler";
import { handleHelp } from "@/bot/handlers/HelpCommandHandler";

/**
 * Registers all Telegram command handlers on the bot instance.
 * Call this once during bootstrap, before bot.launch().
 */
export function registerCommands(): void {
  bot.command("setup", handleSetup);
  bot.command("settings", handleSettings);
  bot.command("settings_edit", handleSettingsEdit);
  bot.command("start", handleStart);
  bot.command("status", handleStatus);
  bot.command("end", handleEnd);
  bot.command("edit", handleEdit);
  bot.command("week", handleWeek);
  bot.command("month", handleMonth);
  bot.command("help", handleHelp);
}
