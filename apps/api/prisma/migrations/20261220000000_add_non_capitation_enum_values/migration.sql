-- P25-T16 (SJ-239): the enum values the BPJS non-capitation recap needs.
--
-- Its own migration because a value added to an enum cannot be used in the
-- transaction that added it, and each migration folder is one transaction.
-- `AuditAction` and `DocumentCategory` carry no `@@map`, so their type names
-- are PascalCase.

-- The payable units of the recap, shaped like the eClaim entry
-- (docs/ops/bpjs-bidan-jejaring-claims-spike.md §6, tariffs from Permenkes
-- 3/2023 Pasal 19–22, pp. 13–16).
CREATE TYPE "non_capitation_service_type" AS ENUM (
    'ANTENATAL_MIDWIFE',
    'ANTENATAL_DOCTOR',
    'ANTENATAL_DOCTOR_ULTRASOUND',
    'PRE_REFERRAL',
    'DELIVERY_WITH_DOCTOR',
    'DELIVERY_HEALTH_WORKER_TEAM',
    'POSTNATAL_MOTHER_NEWBORN',
    'POSTNATAL_MOTHER',
    'FAMILY_PLANNING_IUD',
    'FAMILY_PLANNING_IMPLANT',
    'FAMILY_PLANNING_INJECTION'
);

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'NON_CAPITATION_CLAIM_MARKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'NON_CAPITATION_TARIFF_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'NON_CAPITATION_SETTINGS_CHANGED';

-- The supporting documents Peraturan BPJS 7/2018 Pasal 13–14 asks for that no
-- existing category names: the KIA sheet copy (or kartu ibu), the partograf
-- and the KB book.
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'KIA_BOOK_COPY';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'PARTOGRAPH';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'FAMILY_PLANNING_BOOK';
