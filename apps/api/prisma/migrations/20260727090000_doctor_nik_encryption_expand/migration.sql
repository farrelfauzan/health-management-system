-- Doctor NIK encryption, step 1 of 2: expand.
--
-- A practitioner NIK is the same citizen identifier as a patient NIK and
-- carries the same UU PDP obligations, so P7-T03's plaintext `nik` column is
-- replaced by the same three-column scheme patient_profiles uses. Only
-- STR/SIP numbers are registry-public; those stay plaintext on doctor_licenses.
--
-- This migration only ADDS the encrypted columns — the plaintext `nik` column
-- survives so existing values can be backfilled. Encryption needs the
-- application's AES/HMAC keys, which SQL cannot reach, so the sequence is:
--
--   1. this migration
--   2. pnpm --filter @hms/api backfill:doctor-nik
--   3. 20260727091000_doctor_nik_encryption_contract (drops the plaintext column)
--
-- The contract migration refuses to run while any un-backfilled row remains,
-- so a `migrate deploy` that skips step 2 fails loudly instead of losing data.

-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN "nik_ciphertext" TEXT;
ALTER TABLE "doctor_profiles" ADD COLUMN "nik_index" TEXT;
ALTER TABLE "doctor_profiles" ADD COLUMN "nik_last4" TEXT;
ALTER TABLE "doctor_profiles" ADD COLUMN "nik_key_version" SMALLINT;

-- CreateIndex
-- Nullable unique: Postgres permits many NULLs, so doctors without a recorded
-- NIK coexist.
CREATE UNIQUE INDEX "doctor_profiles_nik_index_key" ON "doctor_profiles"("nik_index");
