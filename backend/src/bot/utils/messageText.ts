import type { Context } from "telegraf";

/** Returns the plain text of the incoming message, or "" if this update has no text. */
export function getMessageText(ctx: Context): string {
  return (ctx.message && "text" in ctx.message ? ctx.message.text : "") ?? "";
}

/**
 * Returns a command message's whitespace-split arguments, excluding the
 * command token itself (e.g. "/edit 12-06" -> ["12-06"]).
 */
export function getCommandArgs(ctx: Context): string[] {
  return getMessageText(ctx).trim().split(/\s+/).slice(1);
}
