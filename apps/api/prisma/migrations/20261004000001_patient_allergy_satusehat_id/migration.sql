-- P10-T08 (SJ-82): the IHS id SATUSEHAT returns for a reported allergy.
--
-- `patient_allergies` is patient-scoped while the outbox is keyed by
-- encounter, which is why allergies have never been reported. They ride the
-- encounter bundle instead, deduplicated per patient: each submission appends
-- the patient's active allergies that have not been reported yet, and after a
-- 201 the returned id is written here. Non-null therefore means "already on
-- the platform, never send again"; null means "not yet reported".
--
-- Nullable with no default and no backfill: every existing row is genuinely
-- unreported, so NULL is the correct value for all of them.

-- AlterTable
ALTER TABLE "patient_allergies" ADD COLUMN "satusehat_allergy_id" TEXT;
