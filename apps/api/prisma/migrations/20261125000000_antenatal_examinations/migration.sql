-- P25-T07 (SJ-230): the 10T examination of an antenatal visit, and the
-- sourced referral prompts a midwife set aside.
--
-- Every examination column is nullable: a checklist item that was not done is
-- "not done", not invalid. Weight, height and blood pressure are absent by
-- design — they come from the encounter's VitalSigns row.

-- CreateEnum
CREATE TYPE "fetal_presentation" AS ENUM ('CEPHALIC', 'BREECH', 'TRANSVERSE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "fetal_head_engagement" AS ENUM ('ENGAGED', 'NOT_ENGAGED');

-- CreateEnum
CREATE TYPE "tetanus_immunization_status" AS ENUM ('T0', 'T1', 'T2', 'T3', 'T4', 'T5');

-- CreateTable
CREATE TABLE "antenatal_examinations" (
    "id" UUID NOT NULL,
    "antenatal_visit_id" UUID NOT NULL,
    "muac_cm" DECIMAL(4,1),
    "fundal_height_cm" DECIMAL(4,1),
    "fetal_heart_rate_bpm" INTEGER,
    "fetal_presentation" "fetal_presentation",
    "fetal_head_engagement" "fetal_head_engagement",
    "fetal_count" INTEGER,
    "estimated_fetal_weight_grams" INTEGER,
    "tetanus_status" "tetanus_immunization_status",
    "iron_tablets_given" INTEGER,
    "counselling_topics" TEXT[],
    "case_management_notes" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "antenatal_examinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "antenatal_referral_dismissals" (
    "id" UUID NOT NULL,
    "antenatal_visit_id" UUID NOT NULL,
    "rule_code" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "dismissed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "antenatal_referral_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "antenatal_examinations_antenatal_visit_id_key" ON "antenatal_examinations"("antenatal_visit_id");

-- CreateIndex
CREATE INDEX "antenatal_examinations_recorded_by_id_idx" ON "antenatal_examinations"("recorded_by_id");

-- CreateIndex
CREATE INDEX "antenatal_referral_dismissals_dismissed_by_id_idx" ON "antenatal_referral_dismissals"("dismissed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "antenatal_referral_dismissals_antenatal_visit_id_rule_code_key" ON "antenatal_referral_dismissals"("antenatal_visit_id", "rule_code");

-- AddForeignKey
ALTER TABLE "antenatal_examinations" ADD CONSTRAINT "antenatal_examinations_antenatal_visit_id_fkey" FOREIGN KEY ("antenatal_visit_id") REFERENCES "antenatal_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "antenatal_examinations" ADD CONSTRAINT "antenatal_examinations_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "antenatal_referral_dismissals" ADD CONSTRAINT "antenatal_referral_dismissals_antenatal_visit_id_fkey" FOREIGN KEY ("antenatal_visit_id") REFERENCES "antenatal_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "antenatal_referral_dismissals" ADD CONSTRAINT "antenatal_referral_dismissals_dismissed_by_id_fkey" FOREIGN KEY ("dismissed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

