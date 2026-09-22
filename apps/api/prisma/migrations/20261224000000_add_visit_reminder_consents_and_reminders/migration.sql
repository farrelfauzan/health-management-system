-- P25-T17 (SJ-240, D-042): consent to WhatsApp visit reminders, and the one
-- reminder each due maternal visit may get.
--
-- The consent is a table of its own, not a purpose column on
-- patient_delivery_consents: that consent covers document delivery only (UU
-- PDP purpose limitation). No backfill — nobody has consented to reminders
-- until the counter asks, and no reminder is sent without it.

-- CreateEnum
CREATE TYPE "MaternalVisitReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "patient_visit_reminder_consents" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "purpose" VARCHAR(32) NOT NULL DEFAULT 'VISIT_REMINDER',
    "is_granted" BOOLEAN NOT NULL DEFAULT true,
    "notice_version_id" UUID,
    "granted_at" TIMESTAMP(3),
    "granted_by_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_visit_reminder_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maternal_visit_reminders" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "visit_key" VARCHAR(160) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "due_from" DATE NOT NULL,
    "status" "MaternalVisitReminderStatus" NOT NULL DEFAULT 'PENDING',
    "attempted_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "failure_reason" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maternal_visit_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_visit_reminder_consents_patient_id_key" ON "patient_visit_reminder_consents"("patient_id");

-- CreateIndex
CREATE INDEX "patient_visit_reminder_consents_notice_version_id_idx" ON "patient_visit_reminder_consents"("notice_version_id");

-- CreateIndex
CREATE INDEX "patient_visit_reminder_consents_granted_by_id_idx" ON "patient_visit_reminder_consents"("granted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "maternal_visit_reminders_patient_id_visit_key_key" ON "maternal_visit_reminders"("patient_id", "visit_key");

-- AddForeignKey
ALTER TABLE "patient_visit_reminder_consents" ADD CONSTRAINT "patient_visit_reminder_consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_visit_reminder_consents" ADD CONSTRAINT "patient_visit_reminder_consents_notice_version_id_fkey" FOREIGN KEY ("notice_version_id") REFERENCES "privacy_notice_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_visit_reminder_consents" ADD CONSTRAINT "patient_visit_reminder_consents_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maternal_visit_reminders" ADD CONSTRAINT "maternal_visit_reminders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The purpose is fixed: this table holds VISIT_REMINDER consent and nothing
-- else, so a later purpose gets its own decision rather than a new value here.
ALTER TABLE "patient_visit_reminder_consents" ADD CONSTRAINT "patient_visit_reminder_consents_purpose_check" CHECK ("purpose" = 'VISIT_REMINDER');

ALTER TABLE "patient_visit_reminder_consents" ADD CONSTRAINT "patient_visit_reminder_consents_revoked_reason_check" CHECK ("revoked_reason" IS NULL OR "revoked_reason" IN ('PATIENT_KEYWORD', 'STAFF'));
