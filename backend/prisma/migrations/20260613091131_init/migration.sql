-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "telegram_id" TEXT NOT NULL,
    "daily_required_minutes" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "workdays" INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_records" (
    "id" TEXT NOT NULL,
    "telegram_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "expected_end_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "worked_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_telegram_id_key" ON "user_settings"("telegram_id");

-- CreateIndex
CREATE INDEX "daily_records_telegram_id_idx" ON "daily_records"("telegram_id");

-- CreateIndex
CREATE INDEX "daily_records_telegram_id_work_date_idx" ON "daily_records"("telegram_id", "work_date");

-- CreateIndex
CREATE INDEX "daily_records_telegram_id_end_time_idx" ON "daily_records"("telegram_id", "end_time");

-- CreateIndex
CREATE UNIQUE INDEX "daily_records_telegram_id_work_date_key" ON "daily_records"("telegram_id", "work_date");
