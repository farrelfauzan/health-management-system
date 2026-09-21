-- P25-T10 (SJ-233): the enum values SHK screening's audit trail and recall
-- notification need.
--
-- Its own migration because a value added to an enum cannot be used in the
-- transaction that added it, and each migration folder is one transaction.
-- `AuditAction` has no `@@map` (PascalCase); `NotificationType` maps to
-- "notification_type".
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SHK_SAMPLE_TAKEN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SHK_RESULT_RECORDED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'SHK_RECALL';
