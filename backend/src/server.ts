import "dotenv/config";
import { Env } from "@/config/Env";
import app from "@/app";
import bot from "@/bot/Bot";
import { registerCommands } from "@/bot/BotCommands";
import { startRecordRetentionJob } from "@/jobs/RecordRetentionJob";
import { startSessionCleanup } from "@/bot/session/SessionStore";

registerCommands();
startRecordRetentionJob();
startSessionCleanup();

app.listen(Env.PORT, () => {
  console.log(`Server running on port ${Env.PORT} [${Env.NODE_ENV}]`);
});

bot.launch();
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));