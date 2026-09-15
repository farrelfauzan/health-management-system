-- A dose copied from a card or KIA book is historical (P24-T12, FR-IM-02):
-- it is reported with primarySource false and an entering performer, and
-- needs neither the lot nor the expiry a dose given here must carry. Every
-- existing row was recorded as given here, so the column defaults to false
-- and nothing is backfilled.
ALTER TABLE "immunizations"
    ADD COLUMN "is_historical" BOOLEAN NOT NULL DEFAULT false;

-- Nullable only for rows recorded before the form required a reason; the
-- bundle skips such a row with IMMUNIZATION_REASON_MISSING rather than
-- inventing one.
ALTER TABLE "immunizations"
    ADD COLUMN "reason" "immunization_reason";
