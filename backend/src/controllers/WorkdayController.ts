import type { NextFunction, Request, Response } from "express";
import {
  startWorkday,
  getTodayStatus,
  endWorkday,
  listWorkdays,
} from "@/services/WorkdayService";
import { success } from "@/utils/ApiResponse";
import type { StartWorkdayInput, EndWorkdayInput, DailyRecordsQuery } from "@/validators/WorkdaySchemas";

export async function start(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { telegramId } = req.body as StartWorkdayInput;
    const record = await startWorkday(telegramId);
    res.status(201).json(success(record));
  } catch (err) {
    next(err);
  }
}

export async function status(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { telegramId } = req.params;
    const result = await getTodayStatus(telegramId);
    res.status(200).json(success(result));
  } catch (err) {
    next(err);
  }
}

export async function end(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { telegramId } = req.body as EndWorkdayInput;
    const result = await endWorkday(telegramId);
    res.status(200).json(success(result));
  } catch (err) {
    next(err);
  }
}

export async function list(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { telegramId } = req.params;
    const { from, to } = req.query as DailyRecordsQuery;
    const records = await listWorkdays(telegramId, from, to);
    res.status(200).json(success(records));
  } catch (err) {
    next(err);
  }
}
