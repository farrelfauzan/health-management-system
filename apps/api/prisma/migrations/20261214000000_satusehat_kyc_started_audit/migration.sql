-- P24-T16 (SJ-215, FR-KYC-05): the audit action written when an operator
-- starts a SATUSEHAT KYC verification.
--
-- Its own migration because a value added to an enum cannot be used in the
-- transaction that added it, and each migration folder is one transaction.
-- `AuditAction` carries no `@@map`, so its type name is PascalCase.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SATUSEHAT_KYC_STARTED';
