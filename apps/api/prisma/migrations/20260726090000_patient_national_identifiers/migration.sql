-- P7-T01: national identity and payer identifiers on patient_profiles.
--
-- Identifiers land already encrypted so no plaintext window ever exists.
-- Each searchable identifier occupies three columns:
--   *_ciphertext : AES-256-GCM (random IV per row) — retrieval only
--   *_index      : HMAC-SHA256(pepper, normalised value) — lookup + uniqueness
--   *_last4      : plaintext last four digits — masked display without decrypt
-- satusehat_patient_id has no blind index: it is always reached via the
-- internal patient id, never searched by value.

-- Key version is tracked per identifier so an incremental key rotation can
-- re-encrypt one value at a time without misdescribing the other.

-- AlterTable
ALTER TABLE "patient_profiles" ADD COLUMN "place_of_birth" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "nik_ciphertext" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "nik_index" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "nik_last4" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "nik_key_version" SMALLINT;
ALTER TABLE "patient_profiles" ADD COLUMN "bpjs_number_ciphertext" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "bpjs_number_index" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "bpjs_number_last4" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "bpjs_number_key_version" SMALLINT;
ALTER TABLE "patient_profiles" ADD COLUMN "satusehat_patient_id_ciphertext" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "satusehat_patient_id_key_version" SMALLINT;

-- CreateIndex
-- Nullable unique: Postgres permits many NULLs, so patients without a NIK or a
-- BPJS number (newborns, foreign nationals, unidentified arrivals) coexist.
CREATE UNIQUE INDEX "patient_profiles_nik_index_key" ON "patient_profiles"("nik_index");

-- CreateIndex
CREATE UNIQUE INDEX "patient_profiles_bpjs_number_index_key" ON "patient_profiles"("bpjs_number_index");
