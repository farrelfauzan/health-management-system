-- PostgreSQL refuses to *use* an enum value in the transaction that added it,
-- so this folder holds only the type changes and the columns and CHECKs that
-- reference PATIENT_CLINICAL live in the very next migration — the same
-- two-folder split 20260906000000/20260906000001 used for the accommodation
-- tariff category. AFTER keeps the database's value order matching
-- schema.prisma so `migrate diff` sees no drift.

-- AlterEnum
ALTER TYPE "DocumentPurpose" ADD VALUE 'PATIENT_CLINICAL' AFTER 'PERSONAL_KNOWLEDGE_BASE';

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('LAB_RESULT', 'RADIOLOGY', 'EXTERNAL_MEDICAL_RECORD', 'REFERRAL_LETTER', 'CONSENT_FORM', 'DISCHARGE_SUMMARY', 'MEDICAL_CERTIFICATE', 'INSURANCE', 'IDENTITY', 'OTHER');
