import { prisma } from "@/config/PrismaClient";
import type { PrismaClientOrTx } from "@/config/PrismaClient";
import type { UserSettings } from "@/generated/prisma/client";

export interface UpsertUserSettingsData {
  telegramId: string;
  dailyRequiredMinutes: number;
  timezone: string;
  workdays: number[];
  vacationAccrualRate: number;
  sickAccrualRate: number;
  accrualAnchorAt: Date;
  accrualAppliedThrough: Date;
}

export interface UpdateUserSettingsData {
  dailyRequiredMinutes?: number;
  timezone?: string;
  workdays?: number[];
  vacationAccrualRate?: number;
  sickAccrualRate?: number;
  vacationBalance?: number;
  sickBalance?: number;
}

export async function findUserSettingsByTelegramId(
  telegramId: string
): Promise<UserSettings | null> {
  return prisma.userSettings.findUnique({ where: { telegramId } });
}

export async function upsertUserSettings(
  input: UpsertUserSettingsData
): Promise<UserSettings> {
  const {
    telegramId,
    dailyRequiredMinutes,
    timezone,
    workdays,
    vacationAccrualRate,
    sickAccrualRate,
    accrualAnchorAt,
    accrualAppliedThrough,
  } = input;
  const payload = {
    dailyRequiredMinutes,
    timezone,
    workdays,
    vacationAccrualRate,
    sickAccrualRate,
    accrualAnchorAt,
    accrualAppliedThrough,
  };

  return prisma.userSettings.upsert({
    where: { telegramId },
    update: payload,
    create: { telegramId, ...payload },
  });
}

export async function updateUserSettings(
  telegramId: string,
  data: UpdateUserSettingsData
): Promise<UserSettings> {
  return prisma.userSettings.update({
    where: { telegramId },
    data,
  });
}

// ── Leave accrual (vacation/sick balance tracking) ────────────────────────────

export interface LeaveAccrualCatchUpData {
  accrualAnchorAt: Date;
  accrualAppliedThrough: Date;
  vacationDelta: number;
  sickDelta: number;
}

/** The accrual bookkeeping values as read before computing a catch-up — used as the optimistic-concurrency guard. */
export interface LeaveAccrualPrevious {
  accrualAnchorAt: Date | null;
  accrualAppliedThrough: Date | null;
}

/**
 * Adds the given deltas to the vacation/sick balances and updates the accrual
 * bookkeeping markers — but ONLY if the row's accrualAnchorAt/accrualAppliedThrough
 * still match `expectedPrevious` (the values read before computing `catchUp`).
 *
 * This is an optimistic-concurrency guard: if two requests read the same
 * "nothing applied yet" state and both compute the same catch-up, only the
 * first write's conditional match succeeds — the second matches zero rows
 * (the row has already moved past `expectedPrevious`) and returns null
 * instead of double-crediting the same elapsed months.
 *
 * Returns the updated settings on success, or null when the conditional
 * update matched no rows (caller should re-fetch rather than retry/reapply —
 * see LeaveBalanceService.applyPendingLeaveAccrual).
 */
export async function applyLeaveAccrual(
  telegramId: string,
  catchUp: LeaveAccrualCatchUpData,
  expectedPrevious: LeaveAccrualPrevious
): Promise<UserSettings | null> {
  const result = await prisma.userSettings.updateMany({
    where: {
      telegramId,
      accrualAnchorAt: expectedPrevious.accrualAnchorAt,
      accrualAppliedThrough: expectedPrevious.accrualAppliedThrough,
    },
    data: {
      vacationBalance: { increment: catchUp.vacationDelta },
      sickBalance: { increment: catchUp.sickDelta },
      accrualAnchorAt: catchUp.accrualAnchorAt,
      accrualAppliedThrough: catchUp.accrualAppliedThrough,
    },
  });

  if (result.count === 0) {
    return null;
  }

  // updateMany doesn't return the row itself — re-fetch it. telegramId is
  // unique, so a count of 1 guarantees the row exists.
  return prisma.userSettings.findUniqueOrThrow({ where: { telegramId } });
}

export type LeaveBalanceField = "vacationBalance" | "sickBalance";

/**
 * Atomically decrements a leave balance. No floor/clamp — negative results
 * are allowed. Accepts an optional transaction client so callers that need
 * this write to be atomic with another write (e.g. the matching DailyRecord
 * upsert) can pass the `tx` from prisma.$transaction().
 */
export async function decrementLeaveBalance(
  telegramId: string,
  field: LeaveBalanceField,
  amount: number,
  client: PrismaClientOrTx = prisma
): Promise<UserSettings> {
  return client.userSettings.update({
    where: { telegramId },
    data: { [field]: { decrement: amount } },
  });
}
