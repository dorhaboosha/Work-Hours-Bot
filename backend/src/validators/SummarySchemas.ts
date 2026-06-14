import { z } from "zod";

/** GET /summaries/week/:telegramId?date=YYYY-MM-DD */
export const WeekSummaryQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format")
    .optional(),
});

export type WeekSummaryQuery = z.infer<typeof WeekSummaryQuerySchema>;

/** GET /summaries/month/:telegramId?month=YYYY-MM */
export const MonthSummaryQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format")
    .optional(),
});

export type MonthSummaryQuery = z.infer<typeof MonthSummaryQuerySchema>;
