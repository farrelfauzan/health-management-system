-- P27-T07 (SJ-248): a clinician's own NPWP, for the BP21 the clinic issues on
-- their jasa medis. Nullable: an individual's NIK serves as NPWP under
-- Coretax, so the withholding draft falls back to the encrypted NIK already
-- on the profile. Plaintext, digits only — a tax number is printed on every
-- bukti potong and is not the citizen identifier the NIK is.

-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN "npwp" VARCHAR(16);

ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_npwp_check" CHECK (
    "npwp" IS NULL OR "npwp" ~ '^[0-9]{15,16}$'
);
