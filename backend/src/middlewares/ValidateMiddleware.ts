import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "@/utils/AppError";

type RequestPart = "body" | "query" | "params";

/**
 * Returns an Express middleware that validates the specified part of the request
 * against a Zod schema. On failure it calls next() with a typed VALIDATION_ERROR
 * AppError; on success it replaces the request part with the parsed (coerced) value.
 */
export function validate(schema: ZodSchema, part: RequestPart = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      const details: Record<string, unknown> = {};
      for (const issue of result.error.issues) {
        const field = issue.path.join(".") || "value";
        details[field] = issue.message;
      }
      next(new AppError("VALIDATION_ERROR", "Validation failed", details));
      return;
    }

    // Replace the request part with the parsed/coerced value
    (req as unknown as Record<string, unknown>)[part] = result.data;
    next();
  };
}
