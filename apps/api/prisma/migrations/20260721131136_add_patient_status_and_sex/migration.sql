-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('IN_PATIENT', 'OUT_PATIENT', 'DISCHARGED');

-- CreateEnum
CREATE TYPE "PatientSex" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "patient_profiles" ADD COLUMN     "sex" "PatientSex",
ADD COLUMN     "status" "PatientStatus" NOT NULL DEFAULT 'OUT_PATIENT';

-- CreateIndex
CREATE INDEX "patient_profiles_status_idx" ON "patient_profiles"("status");
