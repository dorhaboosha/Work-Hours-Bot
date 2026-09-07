-- DropIndex
DROP INDEX "daily_records_telegram_id_end_time_idx";

-- DropIndex
DROP INDEX "daily_records_telegram_id_idx";

-- DropIndex
DROP INDEX "daily_records_telegram_id_record_type_idx";

-- DropIndex
DROP INDEX "daily_records_telegram_id_work_date_idx";

-- CreateIndex
CREATE INDEX "daily_records_telegram_id_record_type_end_time_idx" ON "daily_records"("telegram_id", "record_type", "end_time");
