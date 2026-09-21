-- P27-T10 (SJ-251): which tax reminders have already been raised.
--
-- The claim, not the notification. Notifications fan out to every holder of
-- `tax-report.write:any`; what must happen exactly once is the decision to
-- raise them. Holding that decision here rather than in the sweep's schedule
-- is what lets the sweep run every few hours, survive a restart, and still
-- announce a five-day mark it was down for.

CREATE TYPE "tax_reminder_kind" AS ENUM (
  'OBLIGATION_DUE',
  'TURNOVER_THRESHOLD',
  'PP55_LAST_YEAR'
);

CREATE TABLE "tax_reminder_notices" (
    "id" UUID NOT NULL,
    "kind" "tax_reminder_kind" NOT NULL,
    "notice_key" TEXT NOT NULL,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_reminder_notices_pkey" PRIMARY KEY ("id")
);

-- The uniqueness is the whole mechanism: a second sweep inserting the same
-- claim is refused, and that refusal is what makes "raise it once" true rather
-- than merely likely.
CREATE UNIQUE INDEX "tax_reminder_notices_notice_key_key"
  ON "tax_reminder_notices"("notice_key");

CREATE INDEX "tax_reminder_notices_kind_idx" ON "tax_reminder_notices"("kind");
