-- P24-T07 (SJ-216): an outpatient Encounter reports the poli it happened in,
-- and the outbox records when it could not. See
-- docs/product/prd-satusehat-klinik-bidan.md FR-LOC-09.

-- CreateEnum
-- Two reasons rather than one flag: an unregistered poli is work the Location
-- panel can close, while a visit registered without a specialty is not.
CREATE TYPE "satusehat_location_fallback_reason" AS ENUM ('NO_POLI', 'POLI_NOT_REGISTERED');

-- AlterTable
-- Nullable and kind-agnostic: null means the row named the poli's own
-- Location, named none at all (a lab report has no poli), or settled before
-- this column existed. No backfill — nothing can say retroactively which
-- Location a past bundle carried.
ALTER TABLE "satusehat_submissions"
  ADD COLUMN "location_fallback_reason" "satusehat_location_fallback_reason";
