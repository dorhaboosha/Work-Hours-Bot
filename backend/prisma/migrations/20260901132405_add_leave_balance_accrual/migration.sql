-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "accrual_anchor_at" TIMESTAMP(3),
ADD COLUMN     "accrual_applied_through" TIMESTAMP(3),
ADD COLUMN     "sick_accrual_rate" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
ADD COLUMN     "sick_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "vacation_accrual_rate" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "vacation_balance" DOUBLE PRECISION NOT NULL DEFAULT 0;
