-- P29-T07 (SJ-272): a registration records who pays for the visit.
--
-- Nothing recorded the payer before, so payer mix could not be computed. The
-- column stays nullable: a null payer is "not recorded" and analytics shows it
-- as "Tidak tercatat". It is never read as GENERAL.
-- CreateEnum
CREATE TYPE "payer_type" AS ENUM ('GENERAL', 'BPJS', 'INSURANCE');

-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "payer_type" "payer_type";

-- CreateIndex
CREATE INDEX "registrations_payer_type_registered_at_idx" ON "registrations"("payer_type", "registered_at");

-- Backfill: only a visit with a BPJS trace becomes BPJS, meaning a PCare
-- kunjungan was enqueued for it, or its appointment came from Mobile JKN. Every
-- other existing row stays null. GENERAL is never guessed: a patient with no
-- trace may still have been insured.
UPDATE "registrations" AS r
SET "payer_type" = 'BPJS'
WHERE r."payer_type" IS NULL
  AND (
    EXISTS (
      SELECT 1
      FROM "bpjs_submissions" AS s
      WHERE s."registration_id" = r."id"
        AND s."type" = 'KUNJUNGAN'
    )
    OR EXISTS (
      SELECT 1
      FROM "appointments" AS a
      WHERE a."id" = r."appointment_id"
        AND a."bpjs_booking_code" IS NOT NULL
    )
  );
