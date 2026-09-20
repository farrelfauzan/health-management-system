-- P25-T05 (SJ-228): a doctor's pelimpahan to a midwife. See
-- docs/post-mvp/decisions.md D-036 and docs/ops/midwife-practice-research.md.

-- AlterEnum
-- Its own migration: the values are added here and first written by
-- application code, never by DDL in this transaction.
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_MANDATE_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_MANDATE_REVOKED';
