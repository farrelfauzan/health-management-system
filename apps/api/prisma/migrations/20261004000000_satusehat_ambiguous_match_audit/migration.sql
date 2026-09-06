-- P10-T10 (SJ-77): the audit verb for a refused ambiguous NIK match.
--
-- Linking a patient to somebody else's national record is the one error in
-- this integration that is expensive to discover late — every later bundle
-- lands on the wrong person, and the platform masks NIK in its responses so
-- the code cannot re-verify the match itself. When the master patient index
-- answers with more than one entry we refuse and record why, so a human can
-- resolve it in the SATUSEHAT portal.
--
-- Enum-only migration, split from any table change as every enum addition in
-- this repo is: PostgreSQL cannot use a value in the transaction that added
-- it.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SATUSEHAT_LINK_AMBIGUOUS';
