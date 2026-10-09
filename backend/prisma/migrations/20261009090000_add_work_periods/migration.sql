-- CreateTable
CREATE TABLE "work_periods" (
    "id" TEXT NOT NULL,
    "daily_record_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_periods_daily_record_id_start_time_idx" ON "work_periods"("daily_record_id", "start_time");

-- AddForeignKey
ALTER TABLE "work_periods" ADD CONSTRAINT "work_periods_daily_record_id_fkey" FOREIGN KEY ("daily_record_id") REFERENCES "daily_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing record with logged hours becomes a day with a
-- single period (start_time → end_time). An open session (end_time NULL)
-- becomes an open period. Full-day absences and half days with no hours have
-- no start_time and get no period. daily_records itself is left unchanged,
-- so worked_minutes (and every summary) stays exactly as it was.
INSERT INTO "work_periods" ("id", "daily_record_id", "start_time", "end_time", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "id", "start_time", "end_time", "created_at", "updated_at"
FROM "daily_records"
WHERE "start_time" IS NOT NULL;
