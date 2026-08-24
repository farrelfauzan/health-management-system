-- IMP-15, part 1 of 2: the two new enum values, alone.
--
-- Split from the columns and constraints that use them because PostgreSQL
-- refuses to read a new enum value inside the transaction that added it
-- ("unsafe use of new value of enum type"). Prisma runs one migration per
-- transaction, so the partial index and CHECK in `20260906000001` land in a
-- later transaction and can name 'ACCOMMODATION' freely.
--
-- `AFTER` keeps the database's value order matching the order the Prisma
-- schema declares, so a later `migrate diff` sees no drift.

-- AlterEnum
ALTER TYPE "ServiceTariffCategory" ADD VALUE 'ACCOMMODATION' AFTER 'PROCEDURE';

-- AlterEnum
ALTER TYPE "InvoiceItemType" ADD VALUE 'ACCOMMODATION' AFTER 'MEDICATION';
