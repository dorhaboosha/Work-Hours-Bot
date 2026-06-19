import { prisma } from "@/config/PrismaClient";
import type { UserSettings } from "@/generated/prisma/client";

/** Fields accepted by upsertUserSettings. language is added in task 3.1 after the Prisma migration. */
export interface UpsertUserSettingsData {
  telegramId: string;
  dailyRequiredMinutes: number;
  timezone: string;
  workdays: number[];
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
