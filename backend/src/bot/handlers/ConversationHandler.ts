/**
 * Thin dispatcher: routes plain-text replies to the appropriate flow handler
 * based on the active session step prefix.
 *
 * Registered with bot.on("text", …) in BotCommands.ts.
 * A separate "clear session on command" middleware in BotCommands.ts ensures
 * that any /command automatically terminates an in-progress flow so the
 * command's own handler can start fresh.
 */
import type { Context } from "telegraf";
import { SessionStore } from "@/bot/session/SessionStore";
import { handleSetupStep } from "@/bot/flows/setupFlow";
import { handleSettingsEditStep } from "@/bot/flows/settingsEditFlow";
import { handleEditStep } from "@/bot/flows/editDayFlow";

export async function handleConversation(ctx: Context): Promise<void> {
  const userId = ctx.from?.id?.toString();
  if (!userId) return;

  const session = SessionStore.get(userId);
  if (!session) return;

  const text = ((ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "").trim();

  if (session.step.startsWith("setup:")) {
    await handleSetupStep(ctx, userId, text, session);
  } else if (session.step.startsWith("settings_edit:")) {
    await handleSettingsEditStep(ctx, userId, text, session);
  } else if (session.step.startsWith("edit:")) {
    await handleEditStep(ctx, userId, text, session);
  }
}
