-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BPJS_ELIGIBILITY_CHECKED';

-- CreateEnum
CREATE TYPE "BpjsEligibilityOutcome" AS ENUM ('ACTIVE', 'INACTIVE', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "BpjsEligibilityIdentifierType" AS ENUM ('BPJS_NUMBER', 'NIK');

-- CreateTable
CREATE TABLE "bpjs_eligibility_checks" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "checked_date" DATE NOT NULL,
    "outcome" "BpjsEligibilityOutcome" NOT NULL,
    "checked_via" "BpjsEligibilityIdentifierType" NOT NULL,
    "member_name" TEXT,
    "member_type" TEXT,
    "member_class" TEXT,
    "provider_code" TEXT,
    "provider_name" TEXT,
    "is_registered_here" BOOLEAN,
    "is_prolanis" BOOLEAN NOT NULL DEFAULT false,
    "is_prb" BOOLEAN NOT NULL DEFAULT false,
    "status_reason" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bpjs_eligibility_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bpjs_eligibility_checks_patient_id_checked_date_key" ON "bpjs_eligibility_checks"("patient_id", "checked_date");

-- CreateIndex
CREATE INDEX "bpjs_eligibility_checks_checked_date_idx" ON "bpjs_eligibility_checks"("checked_date");

-- AddForeignKey
ALTER TABLE "bpjs_eligibility_checks" ADD CONSTRAINT "bpjs_eligibility_checks_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
