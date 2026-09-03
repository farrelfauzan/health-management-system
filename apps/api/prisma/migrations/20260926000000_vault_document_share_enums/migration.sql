-- P16-T34: vault document sharing.
--
-- Enum values only. PostgreSQL refuses to *use* an enum value in the
-- transaction that added it, and the next folder's CHECK references
-- 'DOCTOR_VAULT', so the type changes are split out — the same two-folder
-- split 20260921000000/20260921000001 and 20260923000000/20260923000001 used.
-- AFTER keeps the database's value order matching schema.prisma so
-- `migrate diff` sees no drift.

-- AlterEnum
-- SHARED tells the recipient; OPENED tells the owner, the first time a
-- recipient opens what they were handed. The second is the point of the pair:
-- being able to watch the door is what makes people willing to open it.
ALTER TYPE "notification_type" ADD VALUE 'VAULT_DOCUMENT_SHARED' AFTER 'VAULT_DOCUMENT_EXPIRED';
ALTER TYPE "notification_type" ADD VALUE 'VAULT_DOCUMENT_OPENED' AFTER 'VAULT_DOCUMENT_SHARED';

-- AlterEnum
-- SHARED_ACCESS is deliberately distinct from VAULT_DOCUMENT_DOWNLOADED:
-- that one is the owner reading their own file, this one is somebody else
-- using a key they were given. Conflating them would make "did anyone but me
-- open this" unanswerable, which is the one question a share makes worth
-- asking.
ALTER TYPE "AuditAction" ADD VALUE 'VAULT_DOCUMENT_SHARE_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE 'VAULT_DOCUMENT_SHARE_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE 'VAULT_DOCUMENT_SHARED_ACCESS';
