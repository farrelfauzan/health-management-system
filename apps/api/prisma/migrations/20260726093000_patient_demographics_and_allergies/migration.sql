-- P7-T02: demographic and clinical-safety fields required by PMK 24/2022
-- patient identity, plus a structured allergy list.
--
-- Every column is nullable so existing MVP records stay valid; required-ness
-- tightens progressively in the EMR and SATUSEHAT phases.

-- CreateEnum
CREATE TYPE "BloodType" AS ENUM ('A', 'B', 'AB', 'O');

-- CreateEnum
CREATE TYPE "RhesusFactor" AS ENUM ('POSITIVE', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- CreateEnum
-- The six religions recognised on Indonesian civil registration documents,
-- plus an escape hatch for records that do not fit them.
CREATE TYPE "Religion" AS ENUM ('ISLAM', 'PROTESTANTISM', 'CATHOLICISM', 'HINDUISM', 'BUDDHISM', 'CONFUCIANISM', 'OTHER');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');

-- AlterTable
ALTER TABLE "patient_profiles" ADD COLUMN "email" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "blood_type" "BloodType";
ALTER TABLE "patient_profiles" ADD COLUMN "rhesus_factor" "RhesusFactor";
ALTER TABLE "patient_profiles" ADD COLUMN "marital_status" "MaritalStatus";
ALTER TABLE "patient_profiles" ADD COLUMN "occupation" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "religion" "Religion";
ALTER TABLE "patient_profiles" ADD COLUMN "emergency_contact_name" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "emergency_contact_phone" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "guardian_name" TEXT;
ALTER TABLE "patient_profiles" ADD COLUMN "guardian_relation" TEXT;

-- CreateTable
CREATE TABLE "patient_allergies" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" "AllergySeverity" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "patient_allergies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_allergies_patient_id_idx" ON "patient_allergies"("patient_id");

-- CreateIndex
CREATE INDEX "patient_allergies_deleted_at_idx" ON "patient_allergies"("deleted_at");

-- AddForeignKey
ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
