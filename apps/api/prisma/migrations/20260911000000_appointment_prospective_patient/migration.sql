-- P17-T02: an appointment names either a patient the clinic has, or a person
-- who has asked to become one.
--
-- `appointments.patient_id` being NOT NULL is precisely why a chat booking had
-- to invent a patient in the first place (P17-T01): there was nowhere else for
-- the booking to point. It becomes a pair of nullable foreign keys with a CHECK
-- that exactly one is set -- the same shape `invoices.encounter_id` /
-- `admission_id` already uses, whose own migration says an invoice "always
-- names the episode of care it bills, and never two".
--
-- Nothing is backfilled and nothing moves. Every existing row keeps its
-- `patient_id`, so the CHECK holds over the whole table on the first pass, and
-- no appointment carries a prospective patient until P17-T03 repoints the chat
-- booking path at one. This migration only makes the shape possible.

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "prospective_patient_id" UUID,
ALTER COLUMN "patient_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "appointments_prospective_patient_id_scheduled_at_idx" ON "appointments"("prospective_patient_id", "scheduled_at");

-- `RESTRICT` rather than `CASCADE`, matching the `patient_id` side. The expiry
-- sweep (P17-T06) purges prospective records that never converted, and a
-- cascade would let it take live bookings with them -- a booking is the one
-- piece of evidence that somebody intended to arrive.
-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_prospective_patient_id_fkey" FOREIGN KEY ("prospective_patient_id") REFERENCES "prospective_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A booking says who it is for, and never two people at once. Without this, an
-- appointment could carry both keys and every read would have to pick one --
-- which is how the queue board and the arrival worklist would come to disagree
-- about whose slot it is.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_one_subject_check"
  CHECK (("patient_id" IS NULL) <> ("prospective_patient_id" IS NULL));
