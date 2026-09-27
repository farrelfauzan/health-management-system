-- P25-T18 (SJ-256): the audit value for an SHK sample closed without a heel
-- prick.
--
-- Its own migration because a value added to an enum cannot be used in the
-- transaction that added it, and each migration folder is one transaction.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SHK_NOT_SCREENED';
