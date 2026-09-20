-- P24-T09 (SJ-218): a direct admission opens its own visit, so the stay has a
-- chart and one reportable Encounter. See
-- docs/product/prd-satusehat-klinik-bidan.md FR-IP-03.

-- AlterEnum
-- Its own migration: the value is added here and first used by the next one's
-- application code, never by DDL in this transaction.
ALTER TYPE "registration_type" ADD VALUE 'ADMISSION';
