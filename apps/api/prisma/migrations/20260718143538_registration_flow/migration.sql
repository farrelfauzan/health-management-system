-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'CHECKED_IN', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "appointment_id" UUID,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registrations_appointment_id_key" ON "registrations"("appointment_id");

-- CreateIndex
CREATE INDEX "registrations_patient_id_status_idx" ON "registrations"("patient_id", "status");

-- CreateIndex
CREATE INDEX "registrations_status_registered_at_idx" ON "registrations"("status", "registered_at");

-- CreateIndex
CREATE INDEX "registrations_deleted_at_idx" ON "registrations"("deleted_at");

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
