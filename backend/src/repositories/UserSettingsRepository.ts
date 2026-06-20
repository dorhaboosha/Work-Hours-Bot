import { prisma } from "@/config/PrismaClient";
import type { UserSettings } from "@/generated/prisma/client";

export interface UpsertUserSettingsData {
  telegramId: string;
  dailyRequiredMinutes: number;
  timezone: string;
  workdays: number[];
  language?: string;
}

export interface UpdateUserSettingsData {
  dailyRequiredMinutes?: number;
  timezone?: string;
  workdays?: number[];
  language?: string;
}

export async function findUserSettingsByTelegramId(
  telegramId: string
): Promise<UserSettings | null> {
  return prisma.userSettings.findUnique({ where: { telegramId } });
}

export async function upsertUserSettings(
  input: UpsertUserSettingsData
): Promise<UserSettings> {
  const { telegramId, dailyRequiredMinutes, timezone, workdays, language } = input;

  return prisma.userSettings.upsert({
    where: { telegramId },
    update: { dailyRequiredMinutes, timezone, workdays, ...(language !== undefined && { language }) },
    create: { telegramId, dailyRequiredMinutes, timezone, workdays, ...(language !== undefined && { language }) },
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
