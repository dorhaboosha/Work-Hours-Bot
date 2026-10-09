-- At most one open work period (end_time NULL) per daily record. Guards
-- against two concurrent /start requests both opening a period on the same
-- day; the second insert fails with a unique violation and its transaction
-- rolls back. Partial indexes are not expressible in schema.prisma, so this
-- index lives only in SQL.
CREATE UNIQUE INDEX "work_periods_one_open_per_record_idx" ON "work_periods"("daily_record_id") WHERE "end_time" IS NULL;
