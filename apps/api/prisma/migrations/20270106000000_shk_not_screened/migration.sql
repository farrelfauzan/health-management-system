-- P25-T18 (SJ-256): an SHK sample can be closed as not screened.
--
-- P25-T10 backfilled sequence 1 for every existing live birth, so babies born
-- long before SHK was tracked sat as OVERDUE with no way to close them. These
-- columns record who closed a sample, when, and why; the status derived on
-- read becomes NOT_SCREENED and the sample leaves every open list.
-- CreateEnum
CREATE TYPE "shk_not_screened_reason" AS ENUM ('PARENT_DECLINED', 'SCREENED_ELSEWHERE', 'INFANT_DIED', 'LOST_TO_FOLLOW_UP', 'RECORDED_BEFORE_TRACKING', 'OTHER');

-- AlterTable
ALTER TABLE "shk_screenings" ADD COLUMN     "not_screened_at" TIMESTAMPTZ(3),
ADD COLUMN     "not_screened_by_id" UUID,
ADD COLUMN     "not_screened_reason" "shk_not_screened_reason";

-- CreateIndex
CREATE INDEX "shk_screenings_not_screened_by_id_idx" ON "shk_screenings"("not_screened_by_id");

-- AddForeignKey
ALTER TABLE "shk_screenings" ADD CONSTRAINT "shk_screenings_not_screened_by_id_fkey" FOREIGN KEY ("not_screened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Closing, its reason and who closed it are one fact. Only a sample nobody
-- pricked can be closed this way: a taken sample is answered by a result.
ALTER TABLE "shk_screenings" ADD CONSTRAINT "shk_screenings_not_screened_check" CHECK (
  ("not_screened_at" IS NULL AND "not_screened_reason" IS NULL AND "not_screened_by_id" IS NULL)
  OR (
    "not_screened_at" IS NOT NULL
    AND "not_screened_reason" IS NOT NULL
    AND "not_screened_by_id" IS NOT NULL
    AND "sample_taken_at" IS NULL
  )
);
