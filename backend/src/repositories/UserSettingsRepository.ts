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
