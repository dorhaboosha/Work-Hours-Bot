import type { Context, MiddlewareFn } from "telegraf";

/**
 * Returns a middleware that silently drops every update not sent by
 * `ownerTelegramId` — this bot is personal/single-user, so no handler,
 * session, or reply logic downstream ever sees a message from anyone else.
 *
 * Kept dependency-free (no import of Env/Bot) so it can be unit tested
 * without needing the full process environment to be configured.
 */
export function createOwnerOnlyMiddleware(ownerTelegramId: string): MiddlewareFn<Context> {
  return (ctx, next) => {
    const userId = ctx.from?.id?.toString();
    if (userId !== ownerTelegramId) return;
    return next();
  };
}
