import type { Context } from "telegraf";
import { t } from "@/i18n";

export async function handleHelp(ctx: Context): Promise<void> {
  if (!ctx.from?.id) return;
  await ctx.reply(t("help"), { parse_mode: "Markdown" });
}
