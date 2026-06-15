import "dotenv/config";
import { Env } from "@/config/Env";
import app from "@/app";
import bot from "@/bot/Bot";
import { registerCommands } from "@/bot/BotCommands";

registerCommands();

app.listen(Env.PORT, () => {
  console.log(`Server running on port ${Env.PORT} [${Env.NODE_ENV}]`);
});

bot.launch();
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));