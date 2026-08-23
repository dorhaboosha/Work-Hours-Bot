import { z } from "zod";
import { EditDayDateParamSchema } from "@/validators/EditWorkdaySchemas";

/** POST /workdays/start */
export const StartWorkdaySchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
});

export type StartWorkdayInput = z.infer<typeof StartWorkdaySchema>;

/** POST /workdays/end — closes today's active workday; no manual time accepted */
export const EndWorkdaySchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
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

/** Path params schema for GET /workdays/record/:telegramId/:date */
export const RecordDayParamsSchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
  date: EditDayDateParamSchema,
});

export type RecordDayParams = z.infer<typeof RecordDayParamsSchema>;
