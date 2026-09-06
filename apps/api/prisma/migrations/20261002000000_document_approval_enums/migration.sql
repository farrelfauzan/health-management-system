-- P16-T29/T30: the enums behind document approval rounds.
--
-- Split from the table migration that follows, as every enum addition in this
-- repo is: PostgreSQL cannot use a value in the transaction that added it.
--
-- SUPERSEDED sits beside WITHDRAWN rather than folding into it because the
-- two are different facts (FR-E5-15): a withdrawal is the drafter changing
-- their mind, a supersede is the artefact having changed under the panel.

-- CreateEnum
CREATE TYPE "document_approval_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED');

-- P16-T30 (FR-E5-25/26). One value per audience-and-sentence pair; the feed
-- renders copy and a deep link per type. DUE_SOON and OVERDUE are the whole
-- effect a deadline has (FR-E5-28) — nothing decides on one.

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'DOCUMENT_APPROVAL_REQUESTED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'DOCUMENT_APPROVAL_APPROVED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'DOCUMENT_APPROVAL_REJECTED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'DOCUMENT_APPROVAL_SUPERSEDED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'DOCUMENT_APPROVAL_DUE_SOON';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'DOCUMENT_APPROVAL_OVERDUE';

-- P16-T29 (NFR-AUD-03). The approval verbs, and the issue verb both issue
-- paths share so "what did we issue" never depends on the route it took.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPROVAL_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPROVERS_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPROVAL_WITHDRAWN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPROVAL_SUPERSEDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPROVAL_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPROVAL_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DOCUMENT_ISSUED';
