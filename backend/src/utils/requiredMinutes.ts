import type { UserSettings } from "@/generated/prisma/client";
import { isCholHamoed } from "@/utils/hebrewCalendarUtils";

/** The settings fields that decide how many minutes a given day requires. */
export type RequiredMinutesSettings = Pick<
  UserSettings,
  "dailyRequiredMinutes" | "cholHamoedRequiredMinutes"
>;

/**
 * Returns the required minutes for `localDate` (YYYY-MM-DD): the Chol HaMoed
 * hours when the date is a Chol HaMoed day and the user set them, otherwise
 * the normal daily hours.
 */
export function requiredMinutesFor(
  settings: RequiredMinutesSettings,
  localDate: string
): number {
  if (settings.cholHamoedRequiredMinutes !== null && isCholHamoed(localDate)) {
    return settings.cholHamoedRequiredMinutes;
  }
  return settings.dailyRequiredMinutes;
}
