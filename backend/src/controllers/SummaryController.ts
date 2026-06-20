import type { NextFunction, Request, Response } from "express";
import { getWeekSummary, getMonthSummary } from "@/services/SummaryService";
import { success } from "@/utils/ApiResponse";

export async function weekSummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { telegramId } = req.params;
    const result = await getWeekSummary(telegramId);
    res.status(200).json(success(result));
  } catch (err) {
    next(err);
  }
}

export async function monthSummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { telegramId } = req.params;
    const result = await getMonthSummary(telegramId);
    res.status(200).json(success(result));
  } catch (err) {
    next(err);
  }
}
