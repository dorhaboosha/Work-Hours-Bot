import type { UserSettings } from "@/generated/prisma/client";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { applyLeaveAccrual } from "@/repositories/UserSettingsRepository";
import { computeLeaveAccrualCatchUp } from "@/utils/accrualUtils";

/**
 * Applies any leave accrual owed since it was last applied. This codebase has
 * no scheduler, so accrual is caught up lazily whenever a balance is touched
 * — currently: /balance (getLeaveBalance) and marking a debitable absence
 * (EditWorkdayService.markAbsence). No-op (no write) when nothing is owed and
 * the accrual anchor is already initialized.
 *
 * Guards against two concurrent calls double-crediting the same elapsed
 * months: the write is conditional on the accrual bookkeeping still matching
 * what was just read (see UserSettingsRepository.applyLeaveAccrual). If
 * another request already applied a catch-up in between, the conditional
 * write matches nothing and this just re-fetches the now-current settings
 * instead of reapplying — no retry loop needed, since a real race this narrow
 * (both reads landing before either write) can only happen within the same
 * instant, so both requests would compute the same catch-up.
 */
export async function applyPendingLeaveAccrual(
  telegramId: string
): Promise<UserSettings> {
  const settings = await getSettingsOrThrow(telegramId);

  const catchUp = computeLeaveAccrualCatchUp(settings);
  if (!catchUp.changed) {
    return settings;
  }

  const updated = await applyLeaveAccrual(telegramId, catchUp, {
    accrualAnchorAt: settings.accrualAnchorAt,
    accrualAppliedThrough: settings.accrualAppliedThrough,
  });

  if (updated === null) {
    return getSettingsOrThrow(telegramId);
  }

  return updated;
}

export interface LeaveBalance {
  vacationBalance: number;
  sickBalance: number;
}

/** Returns the user's current vacation/sick balances, after catching up any owed accrual. */
export async function getLeaveBalance(telegramId: string): Promise<LeaveBalance> {
  const settings = await applyPendingLeaveAccrual(telegramId);
  return {
    vacationBalance: settings.vacationBalance,
    sickBalance: settings.sickBalance,
  };
}
