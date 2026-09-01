import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { AppError } from "@/utils/AppError";

/**
 * Returns an Express middleware that requires a matching `X-API-Key` header
 * on every request. Comparison is constant-time to avoid leaking the key via
 * response-time differences.
 */
export function createApiKeyMiddleware(expectedApiKey: string) {
  const expected = Buffer.from(expectedApiKey);

  return (req: Request, _res: Response, next: NextFunction): void => {
    const provided = Buffer.from(req.get("x-api-key") ?? "");

    const isValid =
      provided.length === expected.length && timingSafeEqual(provided, expected);

    if (!isValid) {
      next(new AppError("UNAUTHORIZED", "Missing or invalid API key"));
      return;
    }

    next();
  };
}
