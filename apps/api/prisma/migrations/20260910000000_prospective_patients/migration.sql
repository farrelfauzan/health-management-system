-- P17-T01: a staging record for someone who asked for an appointment through a
-- messaging channel and has never attended.
--
-- Today a chat booking creates a real `patient_profiles` row, and that costs
-- three things. It spends an MRN -- allocated atomically from `mrn_counters`
-- and never reused -- on anyone who types a name and a phone number into
-- WhatsApp. It creates a medical record, kept for twenty-five years under PMK
-- 24/2022, for a person who may have been a wrong number. And it is the reason
-- `date_of_birth`, `sex` and `address` are nullable on a clinical record at
-- all: the null exists so that row can exist.
--
-- None of that says PCS-T07 was wrong. Given a schema whose only home for a
-- booking was `patient_profiles`, a null beat a placeholder date. This
-- migration gives it somewhere else to go.
--
-- This is release 1 of three (design 5). It only *adds*: nothing existing
-- changes, the chat path is repointed at these rows by P17-T03, and the
-- backfill and the NOT NULL tightening are P17-T05, deliberately separate
-- releases.

-- CreateEnum
CREATE TYPE "prospective_patient_status" AS ENUM ('AWAITING_ARRIVAL', 'CONVERTED', 'LINKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "prospective_patients" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "channel" "channel_kind" NOT NULL,
    "external_chat_id" TEXT,
    "status" "prospective_patient_status" NOT NULL DEFAULT 'AWAITING_ARRIVAL',
    "patient_id" UUID,
    "converted_at" TIMESTAMP(3),
    "converted_by_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospective_patients_pkey" PRIMARY KEY ("id")
);

-- The expiry sweep's only question: which unresolved rows are past their date.
-- Leading with `status` keeps the scan off the CONVERTED and LINKED rows, which
-- accumulate forever and are never its answer.
-- CreateIndex
CREATE INDEX "prospective_patients_status_expires_at_idx" ON "prospective_patients"("status", "expires_at");

-- CreateIndex
CREATE INDEX "prospective_patients_phone_number_idx" ON "prospective_patients"("phone_number");

-- CreateIndex
CREATE INDEX "prospective_patients_patient_id_idx" ON "prospective_patients"("patient_id");

-- `SET NULL` rather than `CASCADE`: if a patient record is ever hard-deleted,
-- the enquiry that preceded it is not clinical data and does not have to go
-- with it. It simply stops naming a patient.
-- AddForeignKey
ALTER TABLE "prospective_patients" ADD CONSTRAINT "prospective_patients_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An unresolved row does not name a patient, and a resolved one is stamped with
-- when it was resolved. Without the first half, a row could sit in
-- AWAITING_ARRIVAL while already pointing at a patient -- a booking the arrival
-- worklist still shows as unhandled and a clerk resolves a second time, which
-- is the duplicate-record failure the search-first step exists to prevent.
--
-- The mirror rule -- that CONVERTED and LINKED must name a patient -- is
-- deliberately *not* asserted here. The foreign key is ON DELETE SET NULL, so
-- asserting it would make this constraint fire on the UPDATE that SET NULL
-- performs and block the patient delete instead: a check that turns a rare
-- cleanup into an error somewhere else entirely. The repository is what keeps
-- a resolution pointing at its patient.
ALTER TABLE "prospective_patients"
  ADD CONSTRAINT "prospective_patients_resolution_check"
  CHECK (
    ("status" IN ('CONVERTED', 'LINKED') AND "converted_at" IS NOT NULL)
    OR ("status" IN ('AWAITING_ARRIVAL', 'EXPIRED') AND "patient_id" IS NULL AND "converted_at" IS NULL)
  );
