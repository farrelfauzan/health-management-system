-- P10-T15 (SJ-87): prognosis on the encounter, feeding
-- ClinicalImpression.prognosisCodeableConcept.
--
-- Nullable with no default and no backfill: a prognosis nobody recorded is
-- absent, not "bonam". When it is null the element is omitted from the bundle
-- rather than defaulted, so the national record never claims an assessment a
-- doctor did not make.

-- AlterTable
ALTER TABLE "encounters" ADD COLUMN "prognosis" "encounter_prognosis";
