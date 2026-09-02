import { z } from "zod";
import { getLeaveBalanceField } from "@shared/utils/recordTypeUtils";

/**
 * Matches dd-mm format with valid day (01–31) and month (01–12) ranges.
 * Calendar validity (e.g. 31-02 being impossible) is enforced by
 * `resolveDdMmToDate` in DateUtils when constructing the Luxon DateTime.
 */
export const EditDayDateParamSchema = z
  .string()
  .regex(
    /^(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])$/,
    'Date must be in dd-mm format (e.g. "12-06")'
  );

/** Path params schema for GET /workdays/edit/:telegramId/:date */
export const EditDayParamsSchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
  date: EditDayDateParamSchema,
});

export type EditDayParams = z.infer<typeof EditDayParamsSchema>;

/** HH:mm 24-hour format — reused across multiple action schemas */
const hhmmSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    'Time must be in HH:mm format (e.g. "17:30")'
  );

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * SET_END_HOUR — only allowed when the date has an open WORK record.
 * The end time is applied to the edited date, not the current date.
 */
const SetEndHourSchema = z.object({
  action: z.literal("SET_END_HOUR"),
  endTime: hhmmSchema,
});

/**
 * SET_START_AND_END_HOURS — creates or replaces a WORK record for the edited date.
 * endTime must be after startTime.
 */
const SetStartAndEndHoursSchema = z
  .object({
    action: z.literal("SET_START_AND_END_HOURS"),
    startTime: hhmmSchema,
    endTime: hhmmSchema,
  })
  .refine((data) => toMinutes(data.endTime) > toMinutes(data.startTime), {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

/**
 * MARK_ABSENCE — creates or replaces a record with an absence type.
 * recordType must not be WORK. debitDays is required (a positive multiple of
 * 0.5) when recordType debits a leave balance (VACATION/HOLIDAY/HOLIDAY_EVE/
 * SICK — see getLeaveBalanceField); omitted/ignored for UNPAID_ABSENCE/ELECTION.
 */
const MarkAbsenceSchema = z
  .object({
    action: z.literal("MARK_ABSENCE"),
    recordType: z.enum(
      ["SICK", "VACATION", "HOLIDAY", "HOLIDAY_EVE", "UNPAID_ABSENCE", "ELECTION"],
      { errorMap: () => ({ message: "recordType must be a supported absence type" }) }
    ),
    debitDays: z
      .number()
      .positive("debitDays must be greater than 0")
      .multipleOf(0.5, "debitDays must be a multiple of 0.5")
      .optional(),
  })
  .refine(
    (data) => getLeaveBalanceField(data.recordType) === null || data.debitDays !== undefined,
    {
      message: "debitDays is required for SICK, VACATION, HOLIDAY, and HOLIDAY_EVE",
      path: ["debitDays"],
    }
  );

/**
 * Union for PATCH /workdays/edit/:telegramId/:date.
 * z.union is used instead of z.discriminatedUnion because SetStartAndEndHoursSchema
 * uses .refine(), which wraps it in ZodEffects — incompatible with z.discriminatedUnion in Zod v3.
 */
export const EditWorkdaySchema = z.union([
  SetEndHourSchema,
  SetStartAndEndHoursSchema,
  MarkAbsenceSchema,
]);

export type EditWorkdayInput = z.infer<typeof EditWorkdaySchema>;
