-- P25-T05 (SJ-228, FR-AUTH-04): the written pelimpahan a midwife acts under,
-- and the link from every procedure performed on one.

-- CreateEnum
-- Two forms, not one (D-036): a MANDATE leaves responsibility with the doctor
-- who supervises, a DELEGATION moves it to the midwife and is valid only while
-- he is away (PP 28/2024 Pasal 745(3)).
CREATE TYPE "doctor_mandate_kind" AS ENUM ('MANDATE', 'DELEGATION');

-- CreateTable
CREATE TABLE "doctor_mandates" (
    "id" UUID NOT NULL,
    "midwife_doctor_id" UUID NOT NULL,
    "mandating_doctor_id" UUID NOT NULL,
    "kind" "doctor_mandate_kind" NOT NULL,
    "instruction" TEXT NOT NULL,
    "icd9cm_codes" TEXT[] NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "instruction_storage_key" TEXT NOT NULL,
    "instruction_mime_type" TEXT NOT NULL,
    "instruction_size_bytes" INTEGER NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" UUID,
    "revoke_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "doctor_mandates_pkey" PRIMARY KEY ("id")
);

-- A mandate for no procedure at all is not a mandate: the code list is what
-- the gate reads, and an empty one would cover nothing while looking live.
ALTER TABLE "doctor_mandates"
  ADD CONSTRAINT "doctor_mandates_icd9cm_codes_check"
  CHECK (array_length("icd9cm_codes", 1) >= 1);

-- Never open-ended, like every authority (D-036).
ALTER TABLE "doctor_mandates"
  ADD CONSTRAINT "doctor_mandates_validity_check"
  CHECK ("valid_until" >= "valid_from");

-- CreateIndex
CREATE INDEX "doctor_mandates_midwife_doctor_id_idx" ON "doctor_mandates"("midwife_doctor_id");
CREATE INDEX "doctor_mandates_mandating_doctor_id_idx" ON "doctor_mandates"("mandating_doctor_id");
CREATE INDEX "doctor_mandates_valid_until_idx" ON "doctor_mandates"("valid_until");
CREATE INDEX "doctor_mandates_deleted_at_idx" ON "doctor_mandates"("deleted_at");
CREATE INDEX "doctor_mandates_created_by_id_idx" ON "doctor_mandates"("created_by_id");
CREATE INDEX "doctor_mandates_revoked_by_id_idx" ON "doctor_mandates"("revoked_by_id");

-- AddForeignKey
-- Cascade from the midwife (her mandates are hers), Restrict on the mandating
-- doctor: a doctor who has delegated work is not a profile anyone may remove.
ALTER TABLE "doctor_mandates" ADD CONSTRAINT "doctor_mandates_midwife_doctor_id_fkey"
  FOREIGN KEY ("midwife_doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_mandates" ADD CONSTRAINT "doctor_mandates_mandating_doctor_id_fkey"
  FOREIGN KEY ("mandating_doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_mandates" ADD CONSTRAINT "doctor_mandates_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_mandates" ADD CONSTRAINT "doctor_mandates_revoked_by_id_fkey"
  FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
-- Which pelimpahan an action was performed under, so the card can name the
-- responsible clinician without inferring it from dates later.
ALTER TABLE "procedures" ADD COLUMN "mandate_id" UUID;

-- CreateIndex
CREATE INDEX "procedures_mandate_id_idx" ON "procedures"("mandate_id");

-- AddForeignKey
-- Restrict: a mandate that a recorded action rests on cannot be deleted out
-- from under it.
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_mandate_id_fkey"
  FOREIGN KEY ("mandate_id") REFERENCES "doctor_mandates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
