-- P16-T41: the offboarding state, and the bookkeeping that makes its sweep
-- safe to re-run.
--
-- `offboarded_at` is a column on the user and deliberately not a role
-- (§7.3.10.3). The reduced capability set an offboarded person keeps — view,
-- download, export and delete their own vault, nothing else — is a hard-coded
-- branch in the ability factory keyed on this column. A role could be edited
-- in the portal and quietly widened; a code branch cannot. It is distinct
-- from `is_active`: deactivation is an immediate lockout for an incident or a
-- dismissal for cause, offboarding is a graceful exit with a 30-day
-- export-only window, and collapsing the two would hand every dismissed
-- person a month of access.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "offboarded_at" TIMESTAMP(3);

-- CreateIndex
-- The sweep's one read: everyone currently in a window.
CREATE INDEX "users_offboarded_at_idx" ON "users"("offboarded_at");

-- CreateTable
-- Which offboarding emails and sweeps have already happened for a person.
-- Keyed by threshold like the vault and licence expiry notices — 7 for the
-- seven-days-left reminder, 0 for the window closing and the deletion that
-- goes with it — so a sweep that runs twice in a day is a no-op and the
-- deletion is audited exactly once. Rows are removed on re-onboarding, so a
-- second offboarding later starts its notices afresh.
CREATE TABLE "user_offboarding_notices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "threshold_days" INTEGER NOT NULL,
    "notified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_offboarding_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_offboarding_notices_user_id_idx" ON "user_offboarding_notices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_offboarding_notices_user_id_threshold_days_key" ON "user_offboarding_notices"("user_id", "threshold_days");

-- AddForeignKey
-- Cascade: the notice is bookkeeping about a person. When the user row goes,
-- the record of having warned them goes with it.
ALTER TABLE "user_offboarding_notices" ADD CONSTRAINT "user_offboarding_notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
