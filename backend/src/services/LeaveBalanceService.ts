import type { UserSettings } from "@/generated/prisma/client";
import { getSettingsOrThrow } from "@/services/SettingsService";
import { applyLeaveAccrual } from "@/repositories/UserSettingsRepository";
import { computeLeaveAccrualCatchUp } from "@/utils/accrualUtils";

/** Bounded so a pathological run of conflicts can't loop forever — five
 * concurrent writers landing back-to-back on the same account is already an
 * extreme scenario for this bot's usage pattern. */
const MAX_ACCRUAL_ATTEMPTS = 5;

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
 * write matches nothing — rather than assuming the winner's write already
 * covers everything owed, this re-reads the winning state and recomputes,
 * retrying the write if there's still more owed (e.g. the winner's own
 * catch-up already lagged "now" by the time we observe it).
 */
export async function applyPendingLeaveAccrual(
  telegramId: string
): Promise<UserSettings> {
  let settings = await getSettingsOrThrow(telegramId);

  for (let attempt = 0; attempt < MAX_ACCRUAL_ATTEMPTS; attempt++) {
    const catchUp = computeLeaveAccrualCatchUp(settings);
    if (!catchUp.changed) {
      return settings;
    }

    const updated = await applyLeaveAccrual(telegramId, catchUp, {
      accrualAnchorAt: settings.accrualAnchorAt,
      accrualAppliedThrough: settings.accrualAppliedThrough,
    });

    if (updated !== null) {
      return updated;
    }

    // Someone else applied a catch-up in between — re-read the winning
    // state and recompute before deciding whether to try again.
    settings = await getSettingsOrThrow(telegramId);
  }

  // Kept losing the race on every attempt — fall back to the latest read
  // rather than retrying indefinitely.
  return settings;
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
