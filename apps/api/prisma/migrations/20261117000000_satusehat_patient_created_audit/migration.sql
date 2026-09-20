-- P24-T11 (SJ-220): a newborn is created on the SATUSEHAT master patient index
-- under her mother's NIK. See docs/product/prd-satusehat-klinik-bidan.md
-- FR-NB-03 / FR-NB-04.

-- AlterEnum
-- Its own migration: the value is added here and first written by application
-- code, never by DDL in this transaction.
ALTER TYPE "AuditAction" ADD VALUE 'SATUSEHAT_PATIENT_CREATED';
