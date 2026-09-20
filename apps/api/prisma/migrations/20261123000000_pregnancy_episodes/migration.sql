-- P25-T06 (SJ-229): the pregnancy episode a midwife's antenatal work hangs
-- off, and the join row that counts an encounter as one of its visits.

-- CreateEnum
CREATE TYPE "pregnancy_episode_status" AS ENUM ('ACTIVE', 'DELIVERED', 'ENDED');

-- CreateEnum
CREATE TYPE "pregnancy_end_reason" AS ENUM ('DELIVERY', 'MISCARRIAGE', 'LOST_TO_FOLLOW_UP');

-- CreateEnum
CREATE TYPE "estimated_delivery_date_source" AS ENUM ('LMP', 'ULTRASOUND', 'CLINICAL');

-- CreateEnum
CREATE TYPE "antenatal_visit_code" AS ENUM ('K1A', 'K1M', 'K2', 'K3', 'K4', 'K5', 'K6');

-- CreateTable
CREATE TABLE "pregnancy_episodes" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "status" "pregnancy_episode_status" NOT NULL DEFAULT 'ACTIVE',
    "last_menstrual_period_date" DATE,
    "estimated_delivery_date" DATE NOT NULL,
    "edd_source" "estimated_delivery_date_source" NOT NULL,
    "gravida" INTEGER NOT NULL,
    "para" INTEGER NOT NULL,
    "abortus" INTEGER NOT NULL,
    "pre_pregnancy_weight_kg" DECIMAL(5,2),
    "blood_type" TEXT,
    "rhesus" TEXT,
    "risk_notes" TEXT,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" "pregnancy_end_reason",
    "satusehat_episode_of_care_id" TEXT,
    "satusehat_postnatal_episode_of_care_id" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pregnancy_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "antenatal_visits" (
    "id" UUID NOT NULL,
    "pregnancy_episode_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "visit_code" "antenatal_visit_code",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "antenatal_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pregnancy_episodes_patient_id_idx" ON "pregnancy_episodes"("patient_id");

-- CreateIndex
CREATE INDEX "pregnancy_episodes_created_by_id_idx" ON "pregnancy_episodes"("created_by_id");

-- CreateIndex
CREATE INDEX "pregnancy_episodes_deleted_at_idx" ON "pregnancy_episodes"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "antenatal_visits_encounter_id_key" ON "antenatal_visits"("encounter_id");

-- CreateIndex
CREATE INDEX "antenatal_visits_pregnancy_episode_id_idx" ON "antenatal_visits"("pregnancy_episode_id");

-- AddForeignKey
ALTER TABLE "pregnancy_episodes" ADD CONSTRAINT "pregnancy_episodes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancy_episodes" ADD CONSTRAINT "pregnancy_episodes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "antenatal_visits" ADD CONSTRAINT "antenatal_visits_pregnancy_episode_id_fkey" FOREIGN KEY ("pregnancy_episode_id") REFERENCES "pregnancy_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "antenatal_visits" ADD CONSTRAINT "antenatal_visits_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written, and not expressible in the Prisma schema.
--
-- GPA: this pregnancy is itself counted in `gravida`, so the pregnancies that
-- already ended — the births plus the losses — can be at most one fewer.
-- A first pregnancy is therefore G1 P0 A0 and passes.
ALTER TABLE "pregnancy_episodes"
  ADD CONSTRAINT "pregnancy_episodes_gpa_check"
  CHECK ("gravida" >= 1 AND "para" >= 0 AND "abortus" >= 0 AND "para" + "abortus" <= "gravida" - 1);

-- One ACTIVE episode per patient, enforced by the database rather than by a
-- read-then-write in the service: two tabs can open two episodes in the same
-- millisecond, and the second one would otherwise be recorded and quietly
-- start renumbering the first one's visits. Partial, so a woman's earlier,
-- ended pregnancies do not collide with her current one.
CREATE UNIQUE INDEX "pregnancy_episodes_one_active_per_patient_idx"
  ON "pregnancy_episodes"("patient_id")
  WHERE "status" = 'ACTIVE' AND "deleted_at" IS NULL;

-- FR-ANC-07: a doctor visit the mother made at another facility. A klinik
-- bidan without a doctor meets Permenkes 21/2021 Pasal 13(4)–(5) by referring
-- her out, and what comes back is the Buku KIA, not a record in this system.
CREATE TABLE "pregnancy_external_doctor_visits" (
    "id" UUID NOT NULL,
    "pregnancy_episode_id" UUID NOT NULL,
    "facility_name" TEXT NOT NULL,
    "visited_at" DATE NOT NULL,
    "is_ultrasound_done" BOOLEAN NOT NULL DEFAULT false,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pregnancy_external_doctor_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pregnancy_external_doctor_visits_pregnancy_episode_id_idx" ON "pregnancy_external_doctor_visits"("pregnancy_episode_id");

-- CreateIndex
CREATE INDEX "pregnancy_external_doctor_visits_recorded_by_id_idx" ON "pregnancy_external_doctor_visits"("recorded_by_id");

-- AddForeignKey
ALTER TABLE "pregnancy_external_doctor_visits" ADD CONSTRAINT "pregnancy_external_doctor_visits_pregnancy_episode_id_fkey" FOREIGN KEY ("pregnancy_episode_id") REFERENCES "pregnancy_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancy_external_doctor_visits" ADD CONSTRAINT "pregnancy_external_doctor_visits_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
