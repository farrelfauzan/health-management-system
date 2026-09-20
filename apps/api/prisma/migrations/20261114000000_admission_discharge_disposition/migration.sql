-- P24-T08 (SJ-217): an inpatient stay reports the beds it passed through and
-- how it ended. See docs/product/prd-satusehat-klinik-bidan.md FR-IP-01/02.

-- AlterEnum
-- An unregistered bed falls back the same way an unregistered poli does
-- (P24-T07), and the monitor should say which of the two it was. Only
-- application code reads the value, so it needs no second migration folder —
-- that split is for values a CHECK in the same transaction would reference.
ALTER TYPE "satusehat_location_fallback_reason" ADD VALUE 'BED_NOT_REGISTERED';

-- CreateEnum
CREATE TYPE "discharge_disposition" AS ENUM ('HOME', 'AGAINST_ADVICE', 'REFERRED', 'DIED', 'OTHER');

-- AlterTable
-- Nullable rather than defaulted to HOME: a legacy row genuinely has no
-- recorded disposition, and stamping one on it would turn D-030's assumption
-- into a clinical statement staff never made.
ALTER TABLE "admissions"
  ADD COLUMN "discharge_disposition" "discharge_disposition",
  ADD COLUMN "discharge_disposition_note" TEXT;

-- The note is what OTHER means; without it the row says only "some other way".
-- A note alongside another disposition is allowed — "dirujuk ke RSUD" is worth
-- keeping — so this constrains only the case that would otherwise lose meaning.
ALTER TABLE "admissions"
  ADD CONSTRAINT "admissions_discharge_disposition_note_check"
  CHECK (
    "discharge_disposition" IS DISTINCT FROM 'OTHER'
    OR "discharge_disposition_note" IS NOT NULL
  );
