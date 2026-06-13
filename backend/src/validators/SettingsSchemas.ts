import { z } from "zod";

const weekdaySchema = z
  .number()
  .int()
  .min(0, "Weekday must be between 0 (Sunday) and 6 (Saturday)")
  .max(6, "Weekday must be between 0 (Sunday) and 6 (Saturday)");

export const SetupSettingsSchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
  dailyRequiredMinutes: z
    .number()
    .int("dailyRequiredMinutes must be an integer")
    .positive("dailyRequiredMinutes must be greater than 0"),
  timezone: z.string().min(1, "timezone is required"),
  workdays: z
    .array(weekdaySchema)
    .min(1, "workdays must contain at least one day"),
});

export type SetupSettingsInput = z.infer<typeof SetupSettingsSchema>;
