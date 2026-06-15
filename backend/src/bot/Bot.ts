import { Telegraf } from "telegraf";
import { Env } from "@/config/Env";

/**
 * Singleton Telegraf bot instance, initialized with the token from Env.
 * Import this wherever bot commands or handlers need to be registered.
 */
const bot = new Telegraf(Env.TELEGRAM_BOT_TOKEN);

export default bot;
