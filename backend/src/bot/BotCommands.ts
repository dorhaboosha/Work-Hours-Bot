import bot from "@/bot/Bot";
import { SessionStore } from "@/bot/session/SessionStore";
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
import { handleConversation } from "@/bot/handlers/ConversationHandler";

/**
 * Registers all Telegram command handlers on the bot instance.
 * Call this once during bootstrap, before bot.launch().
 */
export function registerCommands(): void {
  // Clear any in-progress session when the user sends a new command.
  // This runs before every command handler so commands always start clean.
  bot.use((ctx, next) => {
    if (ctx.message && "text" in ctx.message && ctx.message.text.startsWith("/")) {
      const userId = ctx.from?.id?.toString();
      if (userId) SessionStore.clear(userId);
    }
    return next();
  });

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

  // Plain-text replies continue an active multi-step conversation.
  // This must be registered after command handlers.
  bot.on("text", handleConversation);
}
