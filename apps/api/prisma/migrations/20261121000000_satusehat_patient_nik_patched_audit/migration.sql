-- P24-T13 (SJ-222): a newborn's first NIK is sent to the SATUSEHAT Patient she
-- was created as, instead of clearing the link the way D-035 does for everyone
-- else. See docs/product/prd-satusehat-klinik-bidan.md FR-NB-05.

-- AlterEnum
-- Its own migration: the value is added here and first written by application
-- code, never by DDL in this transaction.
ALTER TYPE "AuditAction" ADD VALUE 'SATUSEHAT_PATIENT_NIK_PATCHED';
