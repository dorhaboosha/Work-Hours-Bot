import type { Context } from "telegraf";
import { getLeaveBalance } from "@/services/LeaveBalanceService";
import { formatDecimalDays } from "@/bot/utils/formatMessage";
import { handleBotError } from "@/bot/utils/handleBotError";
import { t } from "@/i18n";

/**
 * /balance — shows current vacation/sick balances as of today (any owed
 * accrual is caught up first — see LeaveBalanceService.getLeaveBalance).
 * Deliberately plain output (no Markdown, no emoji), matching the requested
 * format exactly.
 */
export async function handleBalance(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    const { vacationBalance, sickBalance } = await getLeaveBalance(telegramId);

    await ctx.reply(
      t("balance.summary", {
        vacationBalance: formatDecimalDays(vacationBalance),
        sickBalance: formatDecimalDays(sickBalance),
      })
    );
  } catch (err) {
    await handleBotError(ctx, err);
  }
}
