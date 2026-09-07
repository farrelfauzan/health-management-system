-- P18-T12 (SJ-151): the two template kinds the printed clinical requests are
-- authored against, and the audit verbs each print writes.
--
-- Split from the columns that follow, as every enum addition in this repo is:
-- PostgreSQL cannot use a value in the transaction that added it.

-- The surat pengantar and the resep are rendered from the record rather than
-- drafted, which is the whole point: a letter and its order can then never
-- disagree about which tests were requested.

-- AlterEnum
ALTER TYPE "DocumentTemplateKind" ADD VALUE IF NOT EXISTS 'LAB_REQUEST';

-- AlterEnum
ALTER TYPE "DocumentTemplateKind" ADD VALUE IF NOT EXISTS 'PRESCRIPTION';

-- Every print, not only the first. Reprints are routine — paper gets lost —
-- and "how many copies of this resep exist" is a question a pharmacist
-- eventually asks.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LAB_REQUEST_PRINTED';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRESCRIPTION_PRINTED';
