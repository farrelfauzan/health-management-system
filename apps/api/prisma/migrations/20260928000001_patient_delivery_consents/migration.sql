-- P16-T24: per-patient, per-channel permission to receive documents
-- (FR-E4-04), with the privacy-notice version in force when it was captured.
--
-- Consent is a fact with a date and a text behind it, not a boolean on the
-- patient row — the same reasoning that gave privacy-notice acceptance its own
-- table. One row per (patient, channel): a withdrawal UPDATEs the row rather
-- than deleting it, because "this patient opted out on the 3rd" is a fact the
-- clinic must be able to show, and a deleted row shows nothing.
-- `revoked_reason` separates the two ways that happens — PATIENT_KEYWORD for
-- STOP/BERHENTI sent by the patient, STAFF for a withdrawal at the counter.

-- CreateTable
CREATE TABLE "patient_delivery_consents" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "channel" "delivery_channel" NOT NULL,
    "is_granted" BOOLEAN NOT NULL DEFAULT true,
    "notice_version_id" UUID,
    "granted_at" TIMESTAMP(3),
    "granted_by_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_delivery_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_delivery_consents_notice_version_id_idx" ON "patient_delivery_consents"("notice_version_id");

-- CreateIndex
CREATE INDEX "patient_delivery_consents_granted_by_id_idx" ON "patient_delivery_consents"("granted_by_id");

-- CreateIndex
-- The upsert key: the send gate asks "may this patient receive on this
-- channel", and one row is the only shape that has one answer.
CREATE UNIQUE INDEX "patient_delivery_consents_patient_id_channel_key" ON "patient_delivery_consents"("patient_id", "channel");

-- AddForeignKey
-- Cascade: consent is a fact about a patient. When the patient row goes, the
-- permission they gave goes with it.
ALTER TABLE "patient_delivery_consents" ADD CONSTRAINT "patient_delivery_consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull: notice versions are immutable evidence and are never deleted in
-- practice; if one ever were, the consent survives with the reference gone.
ALTER TABLE "patient_delivery_consents" ADD CONSTRAINT "patient_delivery_consents_notice_version_id_fkey" FOREIGN KEY ("notice_version_id") REFERENCES "privacy_notice_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull: the clerk who captured it may leave; the patient's consent does not.
ALTER TABLE "patient_delivery_consents" ADD CONSTRAINT "patient_delivery_consents_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
