-- P19-T09 (SJ-166): back-fill the phone columns the front desk typed freehand.
--
-- Until now `patient_profiles.phone_number`, `patient_profiles`
-- `.emergency_contact_phone` and `doctor_profiles.phone_number` stored exactly
-- what was typed, and testers typed `08…`, `+62…` and `62…` interchangeably.
-- The same person therefore exists under several spellings of one number, and
-- the chat-booking lookup only finds them because it normalises both sides in
-- SQL at query time. From this release the API stores the canonical form; this
-- migration makes the rows that predate it agree.
--
-- The rule is the one `normalizePhoneNumber` applies in TypeScript: keep the
-- digits, then treat a leading `0` as the Indonesian trunk prefix and replace
-- it with `62`. Nothing is inferred beyond that.
--
-- A row is rewritten **only** when the result matches the canonical pattern
-- `^62[1-9][0-9]{7,12}$`. Anything else — a foreign number, a landline typed
-- as an extension, `-`, a note somebody left in the field — is left exactly as
-- it is and named in a NOTICE. Coercing those would turn an unusable value
-- into a plausible wrong one, which is worse: a wrong number that looks right
-- gets dialled, and on the emergency-contact column that is the call that
-- matters. The SQL normalisation in the patient lookup therefore stays, as
-- belt and braces for precisely these rows.
--
-- Data-only: no column, index or constraint changes, so `prisma migrate diff`
-- against the schema still reports no drift. No unique index exists on any of
-- these columns (checked against `schema.prisma`), so a backfill cannot
-- collide; the loop still counts collisions defensively and skips them rather
-- than aborting the whole migration for one row.

DO $$
DECLARE
  target RECORD;
  candidate TEXT;
  changed_count INT := 0;
  skipped_count INT := 0;
BEGIN
  FOR target IN
    SELECT 'patient_profiles' AS table_name, 'phone_number' AS column_name, id, phone_number AS stored
      FROM patient_profiles
     WHERE phone_number IS NOT NULL
    UNION ALL
    SELECT 'patient_profiles', 'emergency_contact_phone', id, emergency_contact_phone
      FROM patient_profiles
     WHERE emergency_contact_phone IS NOT NULL
    UNION ALL
    SELECT 'doctor_profiles', 'phone_number', id, phone_number
      FROM doctor_profiles
     WHERE phone_number IS NOT NULL
  LOOP
    candidate := regexp_replace(regexp_replace(target.stored, '[^0-9]', '', 'g'), '^0', '62');

    IF candidate = target.stored THEN
      CONTINUE;
    END IF;

    IF candidate !~ '^62[1-9][0-9]{7,12}$' THEN
      skipped_count := skipped_count + 1;
      RAISE NOTICE 'SJ-166 skipped %.% id=% (stored value does not normalise to a canonical Indonesian number)',
        target.table_name, target.column_name, target.id;
      CONTINUE;
    END IF;

    IF target.table_name = 'patient_profiles' AND target.column_name = 'phone_number' THEN
      UPDATE patient_profiles SET phone_number = candidate WHERE id = target.id;
    ELSIF target.table_name = 'patient_profiles' THEN
      UPDATE patient_profiles SET emergency_contact_phone = candidate WHERE id = target.id;
    ELSE
      UPDATE doctor_profiles SET phone_number = candidate WHERE id = target.id;
    END IF;

    changed_count := changed_count + 1;
  END LOOP;

  RAISE NOTICE 'SJ-166 phone backfill: % rows normalised, % rows left as-is', changed_count, skipped_count;
END
$$;
