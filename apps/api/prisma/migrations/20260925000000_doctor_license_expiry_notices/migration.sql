-- P16-T19: licence expiry on the structured `DoctorLicense` record.
--
-- The compliance half of the §7.3.2 split, and it touches no document. "Do
-- not let a doctor practise on a lapsed SIP" is a question about a number and
-- a date the clinic already administers, so it is answered from
-- `doctor_licenses` — never from anyone's vault. Nothing added here
-- references `documents`, and that is the design rather than an omission:
-- the clinic's obligation must not depend on a doctor choosing to share a
-- scan, and the dashboard must not become a way to learn that one exists.

-- AlterEnum
-- The clinic-side pair, alongside the owner-only VAULT_DOCUMENT_* values
-- added by 20260923000000. Two pairs for what sounds like one event, because
-- the owner's reminder and the clinic's obligation have different audiences.
-- AFTER keeps the database's value order matching schema.prisma so
-- `migrate diff` sees no drift.
ALTER TYPE "notification_type" ADD VALUE 'LICENCE_EXPIRING' AFTER 'VAULT_DOCUMENT_EXPIRED';
ALTER TYPE "notification_type" ADD VALUE 'LICENCE_EXPIRED' AFTER 'LICENCE_EXPIRING';

-- CreateTable
CREATE TABLE "doctor_license_expiry_notices" (
    "id" UUID NOT NULL,
    "license_id" UUID NOT NULL,
    "threshold_days" INTEGER NOT NULL,
    "notified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_license_expiry_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One notice per licence per threshold. The daily job is expected to run more
-- than once over the same window — a retry, an overlapping schedule, a
-- redeploy mid-run — and every administrator being told twice that the same
-- SIP expires is the failure this table exists to prevent. Recording the fact
-- rather than trusting the schedule is what makes the job safe to re-run.
CREATE UNIQUE INDEX "doctor_license_expiry_notices_license_id_threshold_days_key" ON "doctor_license_expiry_notices"("license_id", "threshold_days");

-- CreateIndex
CREATE INDEX "doctor_license_expiry_notices_license_id_idx" ON "doctor_license_expiry_notices"("license_id");

-- AddForeignKey
-- Cascade: the notice is bookkeeping about a licence. When the licence row
-- goes, the record of having announced it goes with it.
ALTER TABLE "doctor_license_expiry_notices" ADD CONSTRAINT "doctor_license_expiry_notices_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "doctor_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
