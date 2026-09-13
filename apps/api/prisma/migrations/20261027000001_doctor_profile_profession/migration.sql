-- A midwife is a profession on the clinician profile, not a second aggregate
-- (D-034, P24-T02). Every existing profile is a doctor, so the column is added
-- NOT NULL with that default: no backfill statement, and nothing about the
-- doctor flows changes.
ALTER TABLE "doctor_profiles"
    ADD COLUMN "profession" "clinician_profession" NOT NULL DEFAULT 'DOCTOR';

-- The directory filters by profession ("Tenaga klinis", P24-T03).
CREATE INDEX "doctor_profiles_profession_idx" ON "doctor_profiles"("profession");
