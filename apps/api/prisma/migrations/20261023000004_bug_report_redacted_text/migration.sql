-- The reporter's own words, redacted, for a report the triage vendor never
-- answered (P23-T09).
--
-- Nullable and written only on a FALLBACK settle: where a model wrote the
-- ticket, a second redacted copy of the same report would add a row to the
-- retention problem with no reader. Where none did, this *is* the ticket body
-- the Bug Board gets.

ALTER TABLE "bug_reports" ADD COLUMN "redacted_text" TEXT;
