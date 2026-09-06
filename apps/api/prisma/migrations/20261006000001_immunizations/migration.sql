-- P10-T16 (SJ-139): vaccinations as records rather than as free-text notes.
--
-- Klinik pratama routinely vaccinate (DPT-HB-Hib, MR, influenza, COVID
-- boosters, rabies). Today a vaccination is written as a procedure or a note,
-- so it cannot be reported as `Immunization` — which the IG requires with the
-- KFA vaccine code, lot number and dose.
--
-- Vaccines live in the existing `medications` catalog because they *are* KFA
-- products; `is_vaccine` is what filters the picker. Stock movement stays with
-- the pharmacy dispense flow and is not this table's business.

-- AlterTable
ALTER TABLE "medications" ADD COLUMN "is_vaccine" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "medications_is_vaccine_idx" ON "medications"("is_vaccine");

-- CreateTable
CREATE TABLE "immunizations" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    -- Denormalised from the encounter so a patient's immunisation history is
    -- one indexed read rather than a join through every visit they ever made.
    -- It is also the fact that outlives the visit: a vaccination is part of a
    -- person's record, not of an appointment.
    "patient_id" UUID NOT NULL,
    "medication_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "lot_number" TEXT,
    "expiration_date" DATE,
    "dose_number" INTEGER,
    "route" "immunization_route",
    "site" "immunization_site",
    "performed_by_id" UUID,
    "notes" TEXT,
    -- IHS id returned on first successful submission. Non-null means reported.
    "satusehat_immunization_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "immunizations_pkey" PRIMARY KEY ("id")
);

-- A dose number is 1, 2, 3… — never 0 and never negative. Booster schedules
-- run into double digits for some products, so there is no upper bound.
ALTER TABLE "immunizations" ADD CONSTRAINT "immunizations_dose_number_check" CHECK ("dose_number" IS NULL OR "dose_number" >= 1);

-- CreateIndex
CREATE INDEX "immunizations_patient_id_occurred_at_idx" ON "immunizations"("patient_id", "occurred_at");
CREATE INDEX "immunizations_encounter_id_idx" ON "immunizations"("encounter_id");
CREATE INDEX "immunizations_deleted_at_idx" ON "immunizations"("deleted_at");

-- AddForeignKey
ALTER TABLE "immunizations" ADD CONSTRAINT "immunizations_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "immunizations" ADD CONSTRAINT "immunizations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "immunizations" ADD CONSTRAINT "immunizations_medication_id_fkey" FOREIGN KEY ("medication_id") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "immunizations" ADD CONSTRAINT "immunizations_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "doctor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
