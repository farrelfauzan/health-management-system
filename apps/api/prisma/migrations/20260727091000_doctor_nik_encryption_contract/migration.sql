-- Doctor NIK encryption, step 2 of 2: contract.
--
-- Drops the plaintext `nik` column left in place by
-- 20260727090000_doctor_nik_encryption_expand. Run
-- `pnpm --filter @hms/api backfill:doctor-nik` first.

-- Guard: refuse to drop plaintext NIKs that were never backfilled. Without
-- this, a `migrate deploy` that runs both migrations back to back would
-- silently destroy every practitioner NIK, since the backfill step sits
-- between them and cannot be expressed in SQL.
DO $$
DECLARE
  pending_rows BIGINT;
BEGIN
  SELECT count(*) INTO pending_rows
  FROM "doctor_profiles"
  WHERE "nik" IS NOT NULL AND "nik_ciphertext" IS NULL;

  IF pending_rows > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop doctor_profiles.nik: % row(s) still hold a plaintext NIK that was never encrypted. Run "pnpm --filter @hms/api backfill:doctor-nik" before applying this migration.',
      pending_rows;
  END IF;
END $$;

-- DropIndex
DROP INDEX IF EXISTS "doctor_profiles_nik_key";

-- AlterTable
ALTER TABLE "doctor_profiles" DROP COLUMN "nik";
