-- The enum values the triage worker and the Bug Board publisher write (P23-T09,
-- P23-T10), in their own migration ahead of the one that uses them: Postgres
-- will not let a value be added and then referenced in the same transaction as
-- some deployments run it.

-- Four audit verbs rather than a generic UPDATE, because each answers a question
-- the others cannot. TRIAGED carries which side wrote the ticket and the field
-- names and lengths that crossed to the vendor, which is what makes the §5c
-- boundary auditable after the fact. HELD is the evidence that the layer-4
-- control fired at all. PUBLISHED and PUBLISH_FAILED are the two ends of an
-- integration a clinic cannot configure and therefore cannot be asked to
-- explain.
ALTER TYPE "AuditAction" ADD VALUE 'BUG_REPORT_TRIAGED';
ALTER TYPE "AuditAction" ADD VALUE 'BUG_REPORT_HELD';
ALTER TYPE "AuditAction" ADD VALUE 'BUG_REPORT_PUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE 'BUG_REPORT_PUBLISH_FAILED';

-- The reporter's notification when their report is held. Addressed to them and
-- to nobody else: the text is theirs, and they are the only person who can file
-- it again without the detail that held it.
ALTER TYPE "notification_type" ADD VALUE 'BUG_REPORT_HELD';
ALTER TYPE "notification_type" ADD VALUE 'BUG_REPORT_PUBLISH_FAILED';
