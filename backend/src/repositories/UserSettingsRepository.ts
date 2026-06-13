import { prisma } from "@/config/PrismaClient";
import type { UserSettings } from "@/generated/prisma/client";
import type { SetupSettingsInput } from "@/validators/SettingsSchemas";

export async function findUserSettingsByTelegramId(
  telegramId: string
): Promise<UserSettings | null> {
  return prisma.userSettings.findUnique({ where: { telegramId } });
}

export async function upsertUserSettings(
  input: SetupSettingsInput
): Promise<UserSettings> {
  const { telegramId, dailyRequiredMinutes, timezone, workdays } = input;

  return prisma.userSettings.upsert({
    where: { telegramId },
    update: { dailyRequiredMinutes, timezone, workdays },
    create: { telegramId, dailyRequiredMinutes, timezone, workdays },
  });
}
