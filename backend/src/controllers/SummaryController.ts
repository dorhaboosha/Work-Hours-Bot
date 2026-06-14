import type { NextFunction, Request, Response } from "express";
import { getWeekSummary, getMonthSummary } from "@/services/SummaryService";
import { success } from "@/utils/ApiResponse";
import type { WeekSummaryQuery, MonthSummaryQuery } from "@/validators/SummarySchemas";

export async function weekSummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { telegramId } = req.params;
    const { date } = req.query as WeekSummaryQuery;
    const result = await getWeekSummary(telegramId, date);
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
    const { month } = req.query as MonthSummaryQuery;
    const result = await getMonthSummary(telegramId, month);
    res.status(200).json(success(result));
  } catch (err) {
    next(err);
  }
}
