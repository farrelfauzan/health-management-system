-- P25-T07 (SJ-230): the 10T examination, the sourced referral prompts, and the
-- two maternal documents. See docs/product/prd-satusehat-klinik-bidan.md
-- FR-ANC-03 / FR-ANC-04 / FR-ANC-06.

-- AlterEnum
-- Values added to existing enums go in their own migration: a value cannot be
-- used by DDL in the transaction that adds it.
ALTER TYPE "DocumentTemplateKind" ADD VALUE 'REFERRAL_LETTER';
ALTER TYPE "DocumentTemplateKind" ADD VALUE 'PREGNANCY_CERTIFICATE';
ALTER TYPE "DocumentCategory" ADD VALUE 'PREGNANCY_CERTIFICATE';
ALTER TYPE "AuditAction" ADD VALUE 'ANTENATAL_REFERRAL_DISMISSED';
