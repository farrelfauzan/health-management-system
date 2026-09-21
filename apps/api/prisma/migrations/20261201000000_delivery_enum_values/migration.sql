-- P25-T09 (SJ-232): the enum values the birth certificate and its audit trail
-- need.
--
-- Its own migration because a value added to an enum cannot be used in the
-- transaction that added it, and each migration folder is one transaction.
--
-- The type names are PascalCase because these three enums carry no `@@map`;
-- the ones created in the next migration are snake_case because they do. Read
-- the `CREATE TYPE` in migration history rather than guessing from the Prisma
-- name.
ALTER TYPE "DocumentTemplateKind" ADD VALUE IF NOT EXISTS 'BIRTH_CERTIFICATE';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'BIRTH_CERTIFICATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DELIVERY_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DELIVERY_UPDATED';
