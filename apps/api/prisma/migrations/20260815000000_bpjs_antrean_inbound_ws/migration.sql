-- P14-T04: the inbound Antrean Online web-service surface.
--
-- Four independent things land here, all of them prerequisites for a public
-- write path that has an accountable actor:
--   1. audit vocabulary for inbound calls, refusals included;
--   2. a reserved system actor, so a BPJS-originated write is attributable;
--   3. `appointments.bpjs_booking_code`, the provenance marker P14-T05 reads;
--   4. privacy-notice vocabulary for a record created with nobody present.
--
-- No migration here opens the surface. It stays dark until an operator
-- configures a source-IP allowlist *and* BPJS's inbound credentials — see
-- `BpjsAntreanInboundConfig`.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BPJS_ANTREAN_INBOUND_TOKEN_ISSUED';
ALTER TYPE "AuditAction" ADD VALUE 'BPJS_ANTREAN_INBOUND_CALL_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'BPJS_ANTREAN_INBOUND_QUEUE_READ';
ALTER TYPE "AuditAction" ADD VALUE 'BPJS_ANTREAN_INBOUND_BOOKING_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'BPJS_ANTREAN_INBOUND_BOOKING_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'BPJS_ANTREAN_INBOUND_PATIENT_REGISTERED';

-- AlterEnum
ALTER TYPE "PrivacyNoticeOutcome" ADD VALUE 'DEFERRED_REMOTE_REGISTRATION';

-- AlterEnum
ALTER TYPE "PrivacyNoticeProvenance" ADD VALUE 'BPJS_ANTREAN';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "bpjs_booking_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "appointments_bpjs_booking_code_key" ON "appointments"("bpjs_booking_code");
