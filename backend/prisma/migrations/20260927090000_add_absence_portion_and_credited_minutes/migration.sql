-- CreateEnum
CREATE TYPE "AbsencePortion" AS ENUM ('FULL', 'HALF');

-- DropIndex
DROP INDEX "daily_records_telegram_id_record_type_end_time_idx";

-- AlterTable
ALTER TABLE "daily_records" ADD COLUMN     "absence_portion" "AbsencePortion",
ADD COLUMN     "credited_minutes" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "daily_records_telegram_id_end_time_idx" ON "daily_records"("telegram_id", "end_time");

-- Backfill absence records: split the old combined value into credited vs
-- worked minutes, and derive each record's portion.
--   * credited_minutes takes over what worked_minutes used to hold for
--     absences (the credit snapshotted when the absence was marked);
--     worked_minutes becomes 0, since no hours were logged on those days.
--   * HOLIDAY_EVE was always credited half a day with no hours → HALF.
--   * VACATION / SICK debited 0.5 day → HALF. These were previously credited
--     a full day; they now get half of that stored credit (integer division
--     floors, matching floor(dailyRequiredMinutes / 2)).
--   * Everything else → FULL.
-- WORK records are untouched (absence_portion stays NULL, credited_minutes 0).
UPDATE "daily_records"
SET "absence_portion" = CASE
      WHEN "record_type" = 'HOLIDAY_EVE' THEN 'HALF'
      WHEN "record_type" IN ('VACATION', 'SICK') AND "debited_leave_days" = 0.5 THEN 'HALF'
      ELSE 'FULL'
    END::"AbsencePortion",
    "credited_minutes" = CASE
      WHEN "record_type" IN ('VACATION', 'SICK') AND "debited_leave_days" = 0.5
        THEN COALESCE("worked_minutes", 0) / 2
      ELSE COALESCE("worked_minutes", 0)
    END,
    "worked_minutes" = 0
WHERE "record_type" <> 'WORK';
