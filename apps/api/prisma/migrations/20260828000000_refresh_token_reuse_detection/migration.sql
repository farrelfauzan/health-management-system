-- SJ-6: refresh-token rotation with reuse detection.
--
-- The table already rotated tokens and already killed a family when rotation
-- failed. What it could not do is tell the two failure modes apart, because
-- consuming a token and revoking one were the same column write.

-- AlterEnum
-- TOKEN_REUSE is the event an incident review looks for. SESSION_REVOKED_ALL
-- covers the blunt instrument: every family for one user, dropped at once.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TOKEN_REUSE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SESSION_REVOKED_ALL';

-- AlterTable
ALTER TABLE "refresh_tokens"
  ADD COLUMN "consumed_at" TIMESTAMP(3),
  ADD COLUMN "ip_address" TEXT,
  ADD COLUMN "user_agent" TEXT;

-- Backfill. Every existing revoked row was revoked by the old rotation path,
-- which revoked on *consumption* — so those rows were consumed, not attacked.
-- Without this they would all read as evidence of theft the moment the new
-- reuse check starts distinguishing the two.
--
-- Rows revoked by an explicit logout are also swept up here. That is the safe
-- direction to be wrong in: a consumed marker on a revoked row changes
-- nothing, because `revoked_at` is checked first and still refuses the token.
UPDATE "refresh_tokens" SET "consumed_at" = "revoked_at" WHERE "revoked_at" IS NOT NULL;
