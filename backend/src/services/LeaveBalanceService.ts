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
 */
export async function applyPendingLeaveAccrual(
  telegramId: string
): Promise<UserSettings> {
  const settings = await getSettingsOrThrow(telegramId);

  const catchUp = computeLeaveAccrualCatchUp(settings);
  if (!catchUp.changed) {
    return settings;
  }

  return applyLeaveAccrual(telegramId, catchUp);
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
