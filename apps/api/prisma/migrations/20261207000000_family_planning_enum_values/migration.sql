-- P25-T14 (SJ-237): the audit actions a family planning course writes.
--
-- Its own migration because a value added to an enum cannot be used in the
-- transaction that added it, and each migration folder is one transaction.
-- `AuditAction` carries no `@@map`, so its type name is PascalCase.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'FAMILY_PLANNING_STARTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'FAMILY_PLANNING_DISCONTINUED';
