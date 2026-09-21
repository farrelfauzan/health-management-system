-- P25-T14 (SJ-237): the family planning (KB) course and its follow-ups.
--
-- One `family_planning_records` row per method course, and one
-- `family_planning_services` row per follow-up (a reinjection, a resupply, a
-- check-up). The course carries the current `next_due_on`, which is what the
-- due list reads.

CREATE TYPE "contraceptive_method" AS ENUM ('PILL', 'INJECTABLE_1_MONTH', 'INJECTABLE_3_MONTH', 'CONDOM', 'IUD', 'IMPLANT');
CREATE TYPE "acceptor_type" AS ENUM ('NEW', 'CONTINUING');
-- A placeholder list until the pilot clinic's kohort KB columns are known.
CREATE TYPE "contraceptive_discontinuation_reason" AS ENUM ('SIDE_EFFECT', 'WANTS_PREGNANCY', 'METHOD_CHANGE', 'MEDICAL_REASON', 'LOST_TO_FOLLOW_UP', 'OTHER');

CREATE TABLE "family_planning_records" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "method" "contraceptive_method" NOT NULL,
    "acceptor_type" "acceptor_type" NOT NULL,
    "started_on" DATE NOT NULL,
    "provider_doctor_id" UUID NOT NULL,
    "start_encounter_id" UUID,
    "delivery_record_id" UUID,
    "mandate_id" UUID,
    "next_due_on" DATE,
    "side_effects" TEXT,
    "discontinued_on" DATE,
    "discontinuation_reason" "contraceptive_discontinuation_reason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_planning_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "family_planning_services" (
    "id" UUID NOT NULL,
    "family_planning_record_id" UUID NOT NULL,
    "encounter_id" UUID,
    "served_on" DATE NOT NULL,
    "action" TEXT NOT NULL,
    "next_due_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_planning_services_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "family_planning_records_patient_id_idx" ON "family_planning_records"("patient_id");
CREATE INDEX "family_planning_records_provider_doctor_id_idx" ON "family_planning_records"("provider_doctor_id");
CREATE INDEX "family_planning_records_start_encounter_id_idx" ON "family_planning_records"("start_encounter_id");
CREATE INDEX "family_planning_records_delivery_record_id_idx" ON "family_planning_records"("delivery_record_id");
CREATE INDEX "family_planning_records_mandate_id_idx" ON "family_planning_records"("mandate_id");
CREATE INDEX "family_planning_records_next_due_on_idx" ON "family_planning_records"("next_due_on");
CREATE INDEX "family_planning_services_family_planning_record_id_idx" ON "family_planning_services"("family_planning_record_id");
CREATE INDEX "family_planning_services_encounter_id_idx" ON "family_planning_services"("encounter_id");

-- One live course per patient. Partial, so Prisma cannot express it and it
-- lives here only; the service turns its violation into 409
-- FAMILY_PLANNING_COURSE_ACTIVE, which also settles two tabs racing.
CREATE UNIQUE INDEX "family_planning_records_one_live_per_patient_key"
  ON "family_planning_records"("patient_id")
  WHERE "discontinued_on" IS NULL;

-- A course is discontinued with a reason, and a reason belongs to a
-- discontinued course.
ALTER TABLE "family_planning_records" ADD CONSTRAINT "family_planning_records_discontinuation_check" CHECK (
  ("discontinued_on" IS NULL) = ("discontinuation_reason" IS NULL)
);

-- Nothing ends before it starts.
ALTER TABLE "family_planning_records" ADD CONSTRAINT "family_planning_records_dates_check" CHECK (
  ("discontinued_on" IS NULL OR "discontinued_on" >= "started_on")
  AND ("next_due_on" IS NULL OR "next_due_on" >= "started_on")
);

ALTER TABLE "family_planning_records" ADD CONSTRAINT "family_planning_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "family_planning_records" ADD CONSTRAINT "family_planning_records_provider_doctor_id_fkey" FOREIGN KEY ("provider_doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "family_planning_records" ADD CONSTRAINT "family_planning_records_start_encounter_id_fkey" FOREIGN KEY ("start_encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "family_planning_records" ADD CONSTRAINT "family_planning_records_delivery_record_id_fkey" FOREIGN KEY ("delivery_record_id") REFERENCES "delivery_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "family_planning_records" ADD CONSTRAINT "family_planning_records_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "doctor_mandates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "family_planning_services" ADD CONSTRAINT "family_planning_services_family_planning_record_id_fkey" FOREIGN KEY ("family_planning_record_id") REFERENCES "family_planning_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_planning_services" ADD CONSTRAINT "family_planning_services_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
