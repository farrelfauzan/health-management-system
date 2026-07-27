-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "encounters" (
    "id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "status" "EncounterStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "encounters_registration_id_key" ON "encounters"("registration_id");

-- CreateIndex
CREATE INDEX "encounters_patient_id_started_at_idx" ON "encounters"("patient_id", "started_at");

-- CreateIndex
CREATE INDEX "encounters_doctor_id_started_at_idx" ON "encounters"("doctor_id", "started_at");

-- CreateIndex
CREATE INDEX "encounters_status_started_at_idx" ON "encounters"("status", "started_at");

-- CreateIndex
CREATE INDEX "encounters_deleted_at_idx" ON "encounters"("deleted_at");

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
