-- The two audit verbs bug-report intake writes (P23-T08). Their own values
-- rather than a generic CREATE because the questions they answer are specific:
-- how much staff are reporting, and how often the sensitive-data block fires.
-- The second one is the only evidence that the detector is tuned at all.

ALTER TYPE "AuditAction" ADD VALUE 'BUG_REPORT_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE 'BUG_REPORT_REJECTED_SENSITIVE';
