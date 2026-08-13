-- SJ-9: shared-workstation session hygiene.
--
-- One column and two audit verbs. The column is what makes the idle timeout a
-- *server-side* control rather than a screen the browser draws over a session
-- that is still very much alive.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SESSION_TIMEOUT';
ALTER TYPE "AuditAction" ADD VALUE 'SESSION_LOCK';

-- AlterTable
-- Backfilled to `created_at` rather than `now()`: a session that has been open
-- since before this migration should carry the age it actually has, not be
-- handed a fresh 15 minutes by the deploy. Existing idle sessions therefore
-- die at their next refresh, which is the intended behaviour.
ALTER TABLE "refresh_tokens" ADD COLUMN "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "refresh_tokens" SET "last_used_at" = "created_at";

-- CreateIndex
-- The sweeper and any "which sessions are stale" report read this.
CREATE INDEX "refresh_tokens_last_used_at_idx" ON "refresh_tokens"("last_used_at");
