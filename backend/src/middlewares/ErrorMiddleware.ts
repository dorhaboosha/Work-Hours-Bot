import type { NextFunction, Request, Response } from "express";
import { AppError } from "@/utils/AppError";
import { error } from "@/utils/ApiResponse";

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json(error(err.code, err.message, err.details));
    return;
  }

  console.error("Unhandled error:", err);

  res
    .status(500)
    .json(error("INTERNAL_ERROR", "Something went wrong. Please try again later."));
}
