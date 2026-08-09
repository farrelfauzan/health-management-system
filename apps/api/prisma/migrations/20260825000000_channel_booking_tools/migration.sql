-- PCS-T07: the booking half of the WhatsApp/Telegram customer-service channel.
--
-- Three things land together because they are one feature: a chat can claim a
-- patient record (channel_patient_links), it can be challenged to prove the
-- claim (channel_otp_challenges), and when it cannot, the booking still goes
-- through against a draft patient (patient_profiles.source plus the two
-- columns that become nullable to make a draft honest).

-- CreateEnum
CREATE TYPE "channel_verification_status" AS ENUM ('UNVERIFIED', 'CHANNEL_VERIFIED', 'OTP_VERIFIED');

-- CreateEnum
CREATE TYPE "patient_record_source" AS ENUM ('FRONT_DESK', 'CHANNEL_BOOKING');

-- CreateEnum
CREATE TYPE "channel_verification_method" AS ENUM ('CONTACT_SHARE', 'OTP');

-- AlterEnum
-- A chat-created draft is owed the privacy notice for a different reason than
-- a BPJS one, and the arrival worklist has to be able to tell them apart.
ALTER TYPE "PrivacyNoticeProvenance" ADD VALUE 'CHANNEL_BOOKING';

-- AlterTable
-- Existing rows keep their values and become FRONT_DESK, which is what they
-- are: every patient in the table today was typed in by a human.
ALTER TABLE "patient_profiles"
  ADD COLUMN "source" "patient_record_source" NOT NULL DEFAULT 'FRONT_DESK',
  ALTER COLUMN "date_of_birth" DROP NOT NULL,
  ALTER COLUMN "address" DROP NOT NULL;

-- AlterTable
ALTER TABLE "appointments"
  ADD COLUMN "booking_source" "channel_kind",
  ADD COLUMN "booking_reference_code" TEXT;

-- CreateTable
CREATE TABLE "channel_patient_links" (
    "id" UUID NOT NULL,
    "channel" "channel_kind" NOT NULL,
    "external_chat_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "patient_id" UUID,
    "verification_status" "channel_verification_status" NOT NULL DEFAULT 'UNVERIFIED',
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_patient_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_otp_challenges" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "method" "channel_verification_method" NOT NULL DEFAULT 'OTP',
    "patient_id" UUID NOT NULL,
    "code_hash" TEXT,
    "attempts_used" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patient_full_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "doctor_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "session_date" DATE NOT NULL,
    "note" TEXT,

    CONSTRAINT "channel_otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_profiles_source_idx" ON "patient_profiles"("source");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_booking_reference_code_key" ON "appointments"("booking_reference_code");

-- CreateIndex
CREATE INDEX "appointments_booking_source_scheduled_at_idx" ON "appointments"("booking_source", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "channel_patient_links_channel_external_chat_id_phone_number_key" ON "channel_patient_links"("channel", "external_chat_id", "phone_number");

-- CreateIndex
CREATE INDEX "channel_patient_links_patient_id_idx" ON "channel_patient_links"("patient_id");

-- CreateIndex
CREATE INDEX "channel_otp_challenges_conversation_id_created_at_idx" ON "channel_otp_challenges"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "channel_patient_links" ADD CONSTRAINT "channel_patient_links_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_otp_challenges" ADD CONSTRAINT "channel_otp_challenges_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
