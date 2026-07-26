-- CreateEnum
CREATE TYPE "DoctorLicenseType" AS ENUM ('STR', 'SIP');

-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN "nik" TEXT;
ALTER TABLE "doctor_profiles" ADD COLUMN "satusehat_practitioner_id" TEXT;

-- CreateTable
CREATE TABLE "doctor_licenses" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "type" "DoctorLicenseType" NOT NULL,
    "license_number" TEXT NOT NULL,
    "issued_at" DATE,
    "expires_at" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "doctor_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_nik_key" ON "doctor_profiles"("nik");

-- CreateIndex
CREATE INDEX "doctor_licenses_doctor_id_idx" ON "doctor_licenses"("doctor_id");

-- CreateIndex
CREATE INDEX "doctor_licenses_deleted_at_idx" ON "doctor_licenses"("deleted_at");

-- CreateIndex
CREATE INDEX "doctor_licenses_expires_at_idx" ON "doctor_licenses"("expires_at");

-- AddForeignKey
ALTER TABLE "doctor_licenses" ADD CONSTRAINT "doctor_licenses_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
