-- Requires `date_of_birth`, `sex` and `address` on every patient record
-- (`P17-T05`).
--
-- These three were made nullable by `PCS-T07`, when a chat booking created a
-- `PatientProfile` directly: §5.3 forbids asking for a date of birth over an
-- unauthenticated channel, and a placeholder date written into a record PMK
-- 24/2022 keeps for twenty-five years is worse than a null.
--
-- `P17-T03` removed that flow. A chat booking now opens a `ProspectivePatient`
-- — no MRN, no clinical field — and the MRN is allocated at the counter by
-- `P17-T04`, against demographics a human has read off an ID document. Nothing
-- creates a record without these columns any more, so the schema can stop
-- advertising a state the product cannot produce.

-- The guard runs first and deliberately has no repair half.
--
-- `SET NOT NULL` on its own would fail with Postgres's own message, which
-- names the column and not the row, leaving an operator to find the offending
-- record by hand during a deploy. This names it.
--
-- What it must never do is fix anything. A DEFAULT, or an UPDATE filling in a
-- placeholder birth date, is how a made-up date of birth enters a medical
-- record and stays there for twenty-five years. A failed deploy is the correct
-- outcome: the rows are completed through the patient-edit screen, by somebody
-- who can ask, and the migration is re-run.
DO $$
DECLARE
  offending_count integer;
  offending_ids text;
BEGIN
  SELECT COUNT(*), string_agg(id::text, ', ' ORDER BY mrn)
    INTO offending_count, offending_ids
    FROM (
      SELECT "id", "mrn"
        FROM "patient_profiles"
       WHERE "date_of_birth" IS NULL
          OR "sex" IS NULL
          OR "address" IS NULL
          OR btrim("address") = ''
       -- Soft-deleted rows are included on purpose: NOT NULL is a table-wide
       -- constraint, and a retired record fails the ALTER exactly as loudly as
       -- a live one.
       LIMIT 50
    ) AS offending;

  IF offending_count > 0 THEN
    RAISE EXCEPTION
      'P17-T05: % patient profile(s) are missing date_of_birth, sex or address. Complete them through the patient-edit screen and re-run this migration. Offending ids (first 50): %',
      offending_count, offending_ids;
  END IF;
END
$$;

ALTER TABLE "patient_profiles" ALTER COLUMN "date_of_birth" SET NOT NULL;
ALTER TABLE "patient_profiles" ALTER COLUMN "sex" SET NOT NULL;
ALTER TABLE "patient_profiles" ALTER COLUMN "address" SET NOT NULL;
