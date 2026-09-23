-- P28-T01 (SJ-261): the history of admin actions on practice-session
-- occurrences, and the link from a moved occurrence to its replacement.
--
-- A moved occurrence stays at its original start time as a MOVED tombstone
-- (so the weekly projection cannot offer the slot again) and points at the
-- replacement through moved_to_session_id. appointment_session_changes is
-- append-only: one row per move or cancellation, with the reason the patients
-- were told and how many bookings followed, stayed behind or were cancelled.

-- CreateEnum
CREATE TYPE "appointment_session_change_kind" AS ENUM ('MOVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "appointment_sessions" ADD COLUMN     "moved_to_session_id" UUID,
ADD COLUMN     "status_reason" TEXT;

-- CreateTable
CREATE TABLE "appointment_session_changes" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "kind" "appointment_session_change_kind" NOT NULL,
    "reason" TEXT NOT NULL,
    "target_session_id" UUID,
    "moved_count" INTEGER NOT NULL DEFAULT 0,
    "blocked_count" INTEGER NOT NULL DEFAULT 0,
    "cancelled_count" INTEGER NOT NULL DEFAULT 0,
    "actor_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_session_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_session_changes_session_id_occurred_at_idx" ON "appointment_session_changes"("session_id", "occurred_at");

-- CreateIndex
CREATE INDEX "appointment_session_changes_target_session_id_idx" ON "appointment_session_changes"("target_session_id");

-- CreateIndex
CREATE INDEX "appointment_session_changes_actor_user_id_idx" ON "appointment_session_changes"("actor_user_id");

-- CreateIndex
CREATE INDEX "appointment_sessions_moved_to_session_id_idx" ON "appointment_sessions"("moved_to_session_id");

-- AddForeignKey
ALTER TABLE "appointment_sessions" ADD CONSTRAINT "appointment_sessions_moved_to_session_id_fkey" FOREIGN KEY ("moved_to_session_id") REFERENCES "appointment_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_session_changes" ADD CONSTRAINT "appointment_session_changes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "appointment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_session_changes" ADD CONSTRAINT "appointment_session_changes_target_session_id_fkey" FOREIGN KEY ("target_session_id") REFERENCES "appointment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_session_changes" ADD CONSTRAINT "appointment_session_changes_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A move always names its replacement and a cancellation never does, and a
-- reason nobody wrote cannot be told to a patient.
ALTER TABLE "appointment_session_changes"
  ADD CONSTRAINT "appointment_session_changes_target_matches_kind"
  CHECK (("kind" = 'MOVED') = ("target_session_id" IS NOT NULL));
ALTER TABLE "appointment_session_changes"
  ADD CONSTRAINT "appointment_session_changes_reason_not_blank"
  CHECK (length(btrim("reason")) > 0);
ALTER TABLE "appointment_session_changes"
  ADD CONSTRAINT "appointment_session_changes_counts_not_negative"
  CHECK ("moved_count" >= 0 AND "blocked_count" >= 0 AND "cancelled_count" >= 0);
