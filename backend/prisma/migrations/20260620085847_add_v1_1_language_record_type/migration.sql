-- CreateEnum
CREATE TYPE "DailyRecordType" AS ENUM ('WORK', 'SICK', 'VACATION', 'HOLIDAY', 'HOLIDAY_EVE', 'UNPAID_ABSENCE', 'ELECTION');

-- AlterTable
ALTER TABLE "daily_records" ADD COLUMN     "record_type" "DailyRecordType" NOT NULL DEFAULT 'WORK',
ALTER COLUMN "start_time" DROP NOT NULL,
ALTER COLUMN "expected_end_time" DROP NOT NULL;

-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en';

-- CreateIndex
CREATE INDEX "daily_records_telegram_id_record_type_idx" ON "daily_records"("telegram_id", "record_type");
