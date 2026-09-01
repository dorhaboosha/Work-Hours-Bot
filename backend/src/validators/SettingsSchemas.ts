import { z } from "zod";
import { isValidTimezone } from "@/utils/DateUtils";

const timezoneSchema = z
  .string()
  .min(1, "timezone is required")
  .refine(isValidTimezone, {
    message: 'timezone must be a valid IANA timezone (e.g. "Asia/Jerusalem")',
  });

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

/**
 * Vacation/sick accrual rate (days credited per elapsed calendar month).
 * Not restricted to multiples of 0.5 — only balances and mark-absence debit
 * amounts carry that restriction.
 */
const accrualRateSchema = z
  .number()
  .nonnegative("accrual rate must be zero or greater");

/** POST /settings/setup — first-time setup only */
export const SetupSettingsSchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
  dailyRequiredMinutes: dailyRequiredMinutesSchema,
  timezone: timezoneSchema,
  workdays: workdaysSchema,
  vacationAccrualRate: accrualRateSchema.optional(),
  sickAccrualRate: accrualRateSchema.optional(),
});

export type SetupSettingsInput = z.infer<typeof SetupSettingsSchema>;

/**
 * Leave balance override (vacation/sick). May be negative — negative balances
 * are always allowed. Must be a multiple of 0.5.
 */
const leaveBalanceSchema = z
  .number()
  .multipleOf(0.5, "balance must be a multiple of 0.5");

/** PATCH /settings/:telegramId — partial update, at least one field required */
export const UpdateSettingsSchema = z
  .object({
    dailyRequiredMinutes: dailyRequiredMinutesSchema.optional(),
    timezone: timezoneSchema.optional(),
    workdays: workdaysSchema.optional(),
    vacationAccrualRate: accrualRateSchema.optional(),
    sickAccrualRate: accrualRateSchema.optional(),
    vacationBalance: leaveBalanceSchema.optional(),
    sickBalance: leaveBalanceSchema.optional(),
  })
  .refine(
    (data) =>
      data.dailyRequiredMinutes !== undefined ||
      data.timezone !== undefined ||
      data.workdays !== undefined ||
      data.vacationAccrualRate !== undefined ||
      data.sickAccrualRate !== undefined ||
      data.vacationBalance !== undefined ||
      data.sickBalance !== undefined,
    { message: "At least one field must be provided" }
  );

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
