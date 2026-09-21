-- P25-T12 (SJ-235): nifas and neonatal visits, the postnatal examination,
-- and the outbox wiring for closing the PNC episode.

-- CreateEnum
CREATE TYPE "postnatal_visit_code" AS ENUM ('KF1', 'KF2', 'KF3', 'KF4', 'KN1', 'KN2', 'KN3');

-- CreateEnum
CREATE TYPE "postnatal_subject" AS ENUM ('MOTHER', 'NEWBORN');

-- CreateEnum
CREATE TYPE "postnatal_breast_condition" AS ENUM ('NORMAL', 'SWELLING', 'REDNESS', 'NIPPLE_DISCHARGE', 'PAIN');

-- CreateEnum
CREATE TYPE "lochia_colour" AS ENUM ('RUBRA', 'SEROSA', 'ALBA');

-- CreateEnum
CREATE TYPE "breast_milk_production" AS ENUM ('PRESENT', 'LOW', 'ABSENT');

-- CreateTable
CREATE TABLE "postnatal_visits" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "subject" "postnatal_subject" NOT NULL,
    "pregnancy_episode_id" UUID NOT NULL,
    "newborn_care_record_id" UUID,
    "visit_code" "postnatal_visit_code",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postnatal_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postnatal_examinations" (
    "id" UUID NOT NULL,
    "postnatal_visit_id" UUID NOT NULL,
    "vaginal_bleeding" BOOLEAN,
    "blood_loss_ml" INTEGER,
    "perineum_condition" TEXT,
    "perineal_infection_signs" BOOLEAN,
    "caesarean_wound_infection_signs" BOOLEAN,
    "breast_condition" "postnatal_breast_condition",
    "uterine_contraction" BOOLEAN,
    "lochia_colour" "lochia_colour",
    "lochia_odour" BOOLEAN,
    "breast_milk_production" "breast_milk_production",
    "urination" BOOLEAN,
    "defecation" BOOLEAN,
    "newborn_care_counselling" BOOLEAN,
    "vitamin_a_given_at" TIMESTAMPTZ(3),
    "vitamin_a_medication_id" UUID,
    "family_planning_counselling" BOOLEAN,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postnatal_examinations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "postnatal_visits_encounter_id_key" ON "postnatal_visits"("encounter_id");

-- CreateIndex
CREATE INDEX "postnatal_visits_pregnancy_episode_id_idx" ON "postnatal_visits"("pregnancy_episode_id");

-- CreateIndex
CREATE INDEX "postnatal_visits_newborn_care_record_id_idx" ON "postnatal_visits"("newborn_care_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "postnatal_examinations_postnatal_visit_id_key" ON "postnatal_examinations"("postnatal_visit_id");

-- CreateIndex
CREATE INDEX "postnatal_examinations_vitamin_a_medication_id_idx" ON "postnatal_examinations"("vitamin_a_medication_id");

-- CreateIndex
CREATE INDEX "postnatal_examinations_recorded_by_id_idx" ON "postnatal_examinations"("recorded_by_id");

-- AddForeignKey
ALTER TABLE "postnatal_visits" ADD CONSTRAINT "postnatal_visits_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postnatal_visits" ADD CONSTRAINT "postnatal_visits_pregnancy_episode_id_fkey" FOREIGN KEY ("pregnancy_episode_id") REFERENCES "pregnancy_episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postnatal_visits" ADD CONSTRAINT "postnatal_visits_newborn_care_record_id_fkey" FOREIGN KEY ("newborn_care_record_id") REFERENCES "newborn_care_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postnatal_examinations" ADD CONSTRAINT "postnatal_examinations_postnatal_visit_id_fkey" FOREIGN KEY ("postnatal_visit_id") REFERENCES "postnatal_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postnatal_examinations" ADD CONSTRAINT "postnatal_examinations_vitamin_a_medication_id_fkey" FOREIGN KEY ("vitamin_a_medication_id") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postnatal_examinations" ADD CONSTRAINT "postnatal_examinations_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A NEWBORN visit names its baby; a MOTHER visit names none.
ALTER TABLE "postnatal_visits" ADD CONSTRAINT "postnatal_visits_subject_newborn_check" CHECK (
    ("subject" = 'NEWBORN') = ("newborn_care_record_id" IS NOT NULL)
);

-- A KF code belongs to the mother and a KN code to a baby. A null code — a
-- visit outside every window — fits either.
ALTER TABLE "postnatal_visits" ADD CONSTRAINT "postnatal_visits_code_subject_check" CHECK (
    "visit_code" IS NULL
    OR ("subject" = 'MOTHER' AND "visit_code" IN ('KF1', 'KF2', 'KF3', 'KF4'))
    OR ("subject" = 'NEWBORN' AND "visit_code" IN ('KN1', 'KN2', 'KN3'))
);

ALTER TABLE "postnatal_examinations" ADD CONSTRAINT "postnatal_examinations_blood_loss_check" CHECK (
    "blood_loss_ml" IS NULL OR "blood_loss_ml" >= 0
);

-- One *open* PNC close per pregnancy, mirroring
-- `satusehat_submissions_pregnancy_episode_open_key`. This is the guard two
-- sweeps racing each other hit; the sweep itself enqueues only for a
-- pregnancy that has no PNC close row at all, so a sent close is not followed
-- by a second one on the next pass.
CREATE UNIQUE INDEX "satusehat_submissions_postnatal_episode_open_key"
  ON "satusehat_submissions"("pregnancy_episode_id")
  WHERE "kind" = 'POSTNATAL_EPISODE_FINISH' AND "status" <> 'SUBMITTED';

-- Each kind carries exactly its own key column. Replaced rather than added to:
-- the constraint is an exhaustive OR, so a row of a new kind satisfies no
-- branch of the old one.
ALTER TABLE "satusehat_submissions"
  DROP CONSTRAINT "satusehat_submissions_kind_key_check";

ALTER TABLE "satusehat_submissions" ADD CONSTRAINT "satusehat_submissions_kind_key_check" CHECK (
    ("kind" = 'ENCOUNTER' AND "encounter_id" IS NOT NULL AND "lab_order_id" IS NULL AND "pregnancy_episode_id" IS NULL)
    OR
    ("kind" = 'LAB_REPORT' AND "lab_order_id" IS NOT NULL AND "encounter_id" IS NULL AND "pregnancy_episode_id" IS NULL)
    OR
    ("kind" IN ('EPISODE_OF_CARE_FINISH', 'POSTNATAL_EPISODE_FINISH') AND "pregnancy_episode_id" IS NOT NULL AND "encounter_id" IS NULL AND "lab_order_id" IS NULL)
);
