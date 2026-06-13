import { z } from "zod";

/** POST /workdays/start */
export const StartWorkdaySchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
});

export type StartWorkdayInput = z.infer<typeof StartWorkdaySchema>;

/**
 * POST /workdays/end
 * `manualEndTime` is optional; when present it must be HH:mm (00–23 : 00–59).
 */
export const EndWorkdaySchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
  manualEndTime: z
    .string()
    .regex(
      /^([01]\d|2[0-3]):[0-5]\d$/,
      "manualEndTime must be in HH:mm format (00:00–23:59)"
    )
    .optional(),
});

export type EndWorkdayInput = z.infer<typeof EndWorkdaySchema>;

/** GET /workdays/:telegramId?from=YYYY-MM-DD&to=YYYY-MM-DD */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .optional();

export const DailyRecordsQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
});

export type DailyRecordsQuery = z.infer<typeof DailyRecordsQuerySchema>;
