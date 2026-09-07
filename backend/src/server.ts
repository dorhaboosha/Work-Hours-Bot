import "dotenv/config";
import { Env } from "@/config/Env";
import { prisma } from "@/config/PrismaClient";
import app from "@/app";
import bot from "@/bot/Bot";
import { registerCommands } from "@/bot/BotCommands";
import { startRecordRetentionJob } from "@/jobs/RecordRetentionJob";
import { startSessionCleanup } from "@/bot/session/SessionStore";

// Registered up front so any error surfacing before/during bootstrap is
// logged rather than silently crashing the process or hanging it forever.
process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught exception:", err);
  // The process is in an unknown state after this — exit and let the host
  // (Docker/Render) restart it cleanly rather than limping on.
  process.exit(1);
});

registerCommands();

const retentionJobHandle = startRecordRetentionJob();
const sessionCleanupHandle = startSessionCleanup();

const server = app.listen(Env.PORT, () => {
  console.log(`Server running on port ${Env.PORT} [${Env.NODE_ENV}]`);
});

bot.launch().catch((err) => {
  console.error("Failed to launch Telegram bot:", err);
  process.exit(1);
});

/** Milliseconds to wait for a clean shutdown before forcing exit. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Shutdown] Received ${signal}, shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    console.error("[Shutdown] Timed out — forcing exit.");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  clearInterval(retentionJobHandle);
  clearInterval(sessionCleanupHandle);

  bot.stop(signal);

  await new Promise<void>((resolve) => {
    server.close((err) => {
      if (err) console.error("[Shutdown] Error closing HTTP server:", err);
      resolve();
    });
  });

  await prisma.$disconnect();

  clearTimeout(forceExit);
  console.log("[Shutdown] Done.");
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
