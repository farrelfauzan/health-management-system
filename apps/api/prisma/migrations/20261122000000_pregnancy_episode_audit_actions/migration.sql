-- P25-T06 (SJ-229): a pregnancy episode is opened, edited, closed, and
-- encounters are counted against it. See docs/product/prd-satusehat-klinik-bidan.md
-- FR-ANC-01 / FR-ANC-02.

-- AlterEnum
-- Its own migration, ahead of the tables: a value added to an enum cannot be
-- used by DDL in the same transaction, and these are first written by
-- application code anyway.
ALTER TYPE "AuditAction" ADD VALUE 'PREGNANCY_EPISODE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PREGNANCY_EPISODE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PREGNANCY_EPISODE_ENDED';
ALTER TYPE "AuditAction" ADD VALUE 'ANTENATAL_VISIT_LINKED';
