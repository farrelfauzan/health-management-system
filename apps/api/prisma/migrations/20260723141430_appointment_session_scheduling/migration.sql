-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('SESSION', 'SPECIAL_REQUEST');

-- CreateEnum
CREATE TYPE "AppointmentSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppointmentStatus" ADD VALUE 'REQUESTED';
ALTER TYPE "AppointmentStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "queue_number" INTEGER,
ADD COLUMN     "session_id" UUID,
ADD COLUMN     "type" "AppointmentType" NOT NULL DEFAULT 'SESSION';

-- AlterTable
ALTER TABLE "doctor_schedules" ADD COLUMN     "max_patients" INTEGER;

-- CreateTable
CREATE TABLE "appointment_sessions" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "schedule_id" UUID,
    "session_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "max_patients" INTEGER,
    "status" "AppointmentSessionStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_sessions_doctor_id_session_date_idx" ON "appointment_sessions"("doctor_id", "session_date");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_sessions_doctor_id_session_date_start_time_key" ON "appointment_sessions"("doctor_id", "session_date", "start_time");

-- CreateIndex
CREATE INDEX "appointments_session_id_idx" ON "appointments"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_session_id_queue_number_key" ON "appointments"("session_id", "queue_number");

-- AddForeignKey
ALTER TABLE "appointment_sessions" ADD CONSTRAINT "appointment_sessions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_sessions" ADD CONSTRAINT "appointment_sessions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "doctor_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "appointment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: existing exact-time appointments become (already approved) special requests
UPDATE "appointments" SET "type" = 'SPECIAL_REQUEST';
