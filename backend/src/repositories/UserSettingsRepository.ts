import { prisma } from "@/config/PrismaClient";
import type { UserSettings } from "@/generated/prisma/client";

export interface UpsertUserSettingsData {
  telegramId: string;
  dailyRequiredMinutes: number;
  timezone: string;
  workdays: number[];
}

export interface UpdateUserSettingsData {
  dailyRequiredMinutes?: number;
  timezone?: string;
  workdays?: number[];
}

export async function findUserSettingsByTelegramId(
  telegramId: string
): Promise<UserSettings | null> {
  return prisma.userSettings.findUnique({ where: { telegramId } });
}

export async function upsertUserSettings(
  input: UpsertUserSettingsData
): Promise<UserSettings> {
  const { telegramId, dailyRequiredMinutes, timezone, workdays } = input;

  return prisma.userSettings.upsert({
    where: { telegramId },
    update: { dailyRequiredMinutes, timezone, workdays },
    create: { telegramId, dailyRequiredMinutes, timezone, workdays },
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

/**
 * Atomically adds the given deltas to the vacation/sick balances and updates
 * the accrual bookkeeping markers, in a single UPDATE (no read-modify-write race).
 */
export async function applyLeaveAccrual(
  telegramId: string,
  catchUp: LeaveAccrualCatchUpData
): Promise<UserSettings> {
  return prisma.userSettings.update({
    where: { telegramId },
    data: {
      vacationBalance: { increment: catchUp.vacationDelta },
      sickBalance: { increment: catchUp.sickDelta },
      accrualAnchorAt: catchUp.accrualAnchorAt,
      accrualAppliedThrough: catchUp.accrualAppliedThrough,
    },
  });
}

export type LeaveBalanceField = "vacationBalance" | "sickBalance";

/** Atomically decrements a leave balance. No floor/clamp — negative results are allowed. */
export async function decrementLeaveBalance(
  telegramId: string,
  field: LeaveBalanceField,
  amount: number
): Promise<UserSettings> {
  return prisma.userSettings.update({
    where: { telegramId },
    data: { [field]: { decrement: amount } },
  });
}
