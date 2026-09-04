-- P16-T41: offboarding audit verbs.
--
-- Their own verbs rather than USER_UPDATED, because the question asked of
-- this table afterwards is "who let this person go, and when did their
-- documents leave" — a row that looked like any other profile edit would not
-- answer it. The purge is recorded once per person with a count (FR-E3-28),
-- never per document: the documents are gone, and a list of their titles in
-- the audit log would outlive the privacy they had.
--
-- Split from the table migration that follows, as every enum addition in this
-- repo is: PostgreSQL cannot use a value in the transaction that added it.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'USER_OFFBOARDED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_REONBOARDED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_OFFBOARDING_VAULT_PURGED';
