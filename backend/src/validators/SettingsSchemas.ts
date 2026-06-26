import { z } from "zod";

const weekdaySchema = z
  .number()
  .int()
  .min(0, "Weekday must be between 0 (Sunday) and 6 (Saturday)")
  .max(6, "Weekday must be between 0 (Sunday) and 6 (Saturday)");

const dailyRequiredMinutesSchema = z
  .number()
  .int("dailyRequiredMinutes must be an integer")
  .positive("dailyRequiredMinutes must be greater than 0");

const workdaysSchema = z
  .array(weekdaySchema)
  .min(1, "workdays must contain at least one day");

/** POST /settings/setup — first-time setup only */
export const SetupSettingsSchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
  dailyRequiredMinutes: dailyRequiredMinutesSchema,
  timezone: z.string().min(1, "timezone is required"),
  workdays: workdaysSchema,
});

export type SetupSettingsInput = z.infer<typeof SetupSettingsSchema>;

/** PATCH /settings/:telegramId — partial update, at least one field required */
export const UpdateSettingsSchema = z
  .object({
    dailyRequiredMinutes: dailyRequiredMinutesSchema.optional(),
    timezone: z.string().min(1, "timezone must not be empty").optional(),
    workdays: workdaysSchema.optional(),
  })
  .refine(
    (data) =>
      data.dailyRequiredMinutes !== undefined ||
      data.timezone !== undefined ||
      data.workdays !== undefined,
    { message: "At least one field must be provided" }
  );

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
