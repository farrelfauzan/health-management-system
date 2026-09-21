-- P25-T10 (SJ-233): SHK (congenital hypothyroidism) screening samples.
--
-- One row per heel-prick sample of one live baby. Sequence 1 is written with
-- the newborn care record; a RECALL or INVALID_SAMPLE result writes the next.
-- The status shown on the worklist is derived on read from the window and the
-- timestamps, so there is no status column to go stale.
-- CreateEnum
CREATE TYPE "shk_result" AS ENUM ('NORMAL', 'RECALL', 'INVALID_SAMPLE');

-- CreateTable
CREATE TABLE "shk_screenings" (
    "id" UUID NOT NULL,
    "newborn_care_record_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "due_from" TIMESTAMPTZ(3) NOT NULL,
    "due_until" TIMESTAMPTZ(3) NOT NULL,
    "sample_taken_at" TIMESTAMPTZ(3),
    "sample_taken_by_id" UUID,
    "sent_at" TIMESTAMPTZ(3),
    "laboratory_name" TEXT,
    "result_received_at" TIMESTAMPTZ(3),
    "result" "shk_result",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shk_screenings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shk_screenings_sample_taken_by_id_idx" ON "shk_screenings"("sample_taken_by_id");

-- CreateIndex
CREATE INDEX "shk_screenings_due_until_idx" ON "shk_screenings"("due_until");

-- CreateIndex
CREATE UNIQUE INDEX "shk_screenings_newborn_care_record_id_sequence_key" ON "shk_screenings"("newborn_care_record_id", "sequence");

-- AddForeignKey
ALTER TABLE "shk_screenings" ADD CONSTRAINT "shk_screenings_newborn_care_record_id_fkey" FOREIGN KEY ("newborn_care_record_id") REFERENCES "newborn_care_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shk_screenings" ADD CONSTRAINT "shk_screenings_sample_taken_by_id_fkey" FOREIGN KEY ("sample_taken_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A sample's order among its baby's samples starts at 1.
ALTER TABLE "shk_screenings" ADD CONSTRAINT "shk_screenings_sequence_check" CHECK ("sequence" >= 1);

-- A window closes after it opens.
ALTER TABLE "shk_screenings" ADD CONSTRAINT "shk_screenings_window_check" CHECK ("due_until" > "due_from");

-- A card is sent only after the heel prick, and always to a named laboratory.
ALTER TABLE "shk_screenings" ADD CONSTRAINT "shk_screenings_sent_check" CHECK (
  ("sent_at" IS NULL AND "laboratory_name" IS NULL)
  OR ("sent_at" IS NOT NULL AND "laboratory_name" IS NOT NULL AND "sample_taken_at" IS NOT NULL)
);

-- A result and the instant it arrived are one fact, and need a sample.
ALTER TABLE "shk_screenings" ADD CONSTRAINT "shk_screenings_result_check" CHECK (
  ("result" IS NULL AND "result_received_at" IS NULL)
  OR ("result" IS NOT NULL AND "result_received_at" IS NOT NULL AND "sample_taken_at" IS NOT NULL)
);
