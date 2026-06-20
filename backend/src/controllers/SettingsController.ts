import type { NextFunction, Request, Response } from "express";
import { setupSettings, getSettingsOrThrow } from "@/services/SettingsService";
import { success } from "@/utils/ApiResponse";
import type { SetupSettingsInput } from "@/validators/SettingsSchemas";
import type { Weekday, LanguageCode } from "@shared/types/CoreTypes";

export async function setup(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = req.body as SetupSettingsInput;
    const settings = await setupSettings({
      telegramId: input.telegramId,
      dailyHoursOrMinutes: input.dailyRequiredMinutes,
      timezone: input.timezone,
      workdays: input.workdays as Weekday[],
      language: input.language as LanguageCode,
    });
    res.status(201).json(success(settings));
  } catch (err) {
    next(err);
  }
}

export async function getByTelegramId(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { telegramId } = req.params;
    const settings = await getSettingsOrThrow(telegramId);
    res.status(200).json(success(settings));
  } catch (err) {
    next(err);
  }
}
