-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_IDENTIFIER_UNMASKED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_IDENTIFIER_UNMASKED';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_MRN_IMPORTED';

-- CreateTable
CREATE TABLE "mrn_counters" (
    "facility_id" UUID NOT NULL,
    "next_value" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mrn_counters_pkey" PRIMARY KEY ("facility_id")
);

-- Seed the single-facility counter above every MRN already on file, so no
-- allocated number can collide with a record created before auto-generation.
-- Legacy MRNs are free-form (`MRN-0001`, `RM/2024/17`), so the starting point
-- is the highest digit sequence any existing MRN contains; over-long digit
-- strings are ignored rather than overflowing bigint.
INSERT INTO "mrn_counters" ("facility_id", "next_value", "updated_at")
SELECT
    '00000000-0000-0000-0000-000000000000'::uuid,
    COALESCE(
        (
            SELECT MAX("digits"::bigint)
            FROM (
                SELECT regexp_replace("mrn", '\D', '', 'g') AS "digits"
                FROM "patient_profiles"
            ) AS "extracted"
            WHERE "digits" <> '' AND length("digits") <= 18
        ),
        0
    ) + 1,
    NOW()
ON CONFLICT ("facility_id") DO NOTHING;
