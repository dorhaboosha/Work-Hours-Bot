import type { NextFunction, Request, Response } from "express";
import { setupSettings, getSettingsOrThrow, updateSettings } from "@/services/SettingsService";
import { success } from "@/utils/ApiResponse";
import type { SetupSettingsInput, UpdateSettingsInput } from "@/validators/SettingsSchemas";
import type { Weekday } from "@shared/types/CoreTypes";

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
    });
    res.status(201).json(success(settings));
  } catch (err) {
    next(err);
  }
}

export async function updateByTelegramId(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { telegramId } = req.params;
    const input = req.body as UpdateSettingsInput;
    const settings = await updateSettings(telegramId, {
      dailyRequiredMinutes: input.dailyRequiredMinutes,
      timezone: input.timezone,
      workdays: input.workdays as Weekday[] | undefined,
    });
    res.status(200).json(success(settings));
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
