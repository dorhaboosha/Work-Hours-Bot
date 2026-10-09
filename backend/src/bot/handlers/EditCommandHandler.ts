import type { Context } from "telegraf";
import { getEditDayOptions } from "@/services/EditWorkdayService";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/i18n";
import { startEditFlow } from "@/bot/flows/editDayFlow";
import { formatEditMenuPrompt } from "@/bot/utils/formatEditMessage";
import { buildEditMenu } from "@/constants/editActions";
import { DD_MM_RE } from "@/constants/timeFormats";
import { getCommandArgs } from "@/bot/utils/messageText";

export async function handleEdit(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const args = getCommandArgs(ctx);

  try {
    if (args.length === 0 || !DD_MM_RE.test(args[0])) {
      await ctx.reply(t("edit.usageHint"), { parse_mode: "Markdown" });
      return;
    }

    const ddMm = args[0];
    const options = await getEditDayOptions(telegramId, ddMm);
    const menu = buildEditMenu(options.state, options.allowedActions, options.periods.length);

    await startEditFlow(
      ctx,
      telegramId,
      ddMm,
      menu.map((entry) => entry.action),
      options.periods.length,
      formatEditMenuPrompt(options, menu)
    );
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
