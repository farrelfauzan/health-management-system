-- P18-T01 (SJ-141): the laboratory catalog's enums, and the LAB value the
-- billing enums need before a lab line can be priced or invoiced.
--
-- Split from the tables that follow, as every enum change in this repo is:
-- PostgreSQL cannot use a value in the transaction that added it, and
-- `service_tariffs.category = 'LAB'` is exactly such a use.

-- CreateEnum
CREATE TYPE "lab_result_type" AS ENUM ('NUMERIC', 'TEXT', 'CODED');

-- CreateEnum
CREATE TYPE "lab_specimen_type" AS ENUM ('WHOLE_BLOOD', 'SERUM', 'PLASMA', 'URINE', 'STOOL', 'SPUTUM', 'SWAB', 'OTHER');

-- A lab line is priced from the catalog rather than from an ICD-9-CM code, so
-- it is its own tariff category rather than a kind of PROCEDURE. The invoice
-- item type follows for the same reason: the two reconcile separately.

-- AlterEnum
ALTER TYPE "ServiceTariffCategory" ADD VALUE IF NOT EXISTS 'LAB';

-- AlterEnum
ALTER TYPE "InvoiceItemType" ADD VALUE IF NOT EXISTS 'LAB';
