-- PostgreSQL refuses to *use* an enum value in the transaction that added it,
-- so this folder holds only the type changes; the columns and CHECKs that
-- reference DOCTOR_VAULT live in the very next migration — the same
-- two-folder split 20260921000000/20260921000001 used for PATIENT_CLINICAL.
-- AFTER keeps the database's value order matching schema.prisma so
-- `migrate diff` sees no drift.

-- AlterEnum
ALTER TYPE "DocumentPurpose" ADD VALUE 'DOCTOR_VAULT' AFTER 'PATIENT_CLINICAL';

-- AlterEnum
-- Owner-only notices. Nothing aggregates these for an administrator; see the
-- enum comment in schema.prisma.
ALTER TYPE "notification_type" ADD VALUE 'VAULT_DOCUMENT_EXPIRING' AFTER 'CONVERSATION_HANDOFF';
ALTER TYPE "notification_type" ADD VALUE 'VAULT_DOCUMENT_EXPIRED' AFTER 'VAULT_DOCUMENT_EXPIRING';

-- CreateEnum
CREATE TYPE "VaultDocumentCategory" AS ENUM ('REGISTRATION_LICENCE', 'EDUCATION', 'COMPETENCE', 'CONTINUING_EDUCATION', 'INSURANCE', 'EMPLOYMENT', 'IDENTITY_TAX', 'CURRICULUM_VITAE', 'PERSONAL_REFERENCE', 'OTHER');
