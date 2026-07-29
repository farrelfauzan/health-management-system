-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BPJS_SUBMISSION_RETRIED';

-- CreateEnum
CREATE TYPE "BpjsSubmissionType" AS ENUM ('PENDAFTARAN', 'KUNJUNGAN', 'PENDAFTARAN_DELETE');

-- CreateEnum
CREATE TYPE "BpjsSubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "bpjs_submissions" (
    "id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "type" "BpjsSubmissionType" NOT NULL,
    "status" "BpjsSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "bpjs_reference_no" TEXT,
    "submitted_kd_poli" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bpjs_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bpjs_submissions_registration_id_type_key" ON "bpjs_submissions"("registration_id", "type");

-- CreateIndex
CREATE INDEX "bpjs_submissions_status_next_attempt_at_idx" ON "bpjs_submissions"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "bpjs_submissions" ADD CONSTRAINT "bpjs_submissions_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
