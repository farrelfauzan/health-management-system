-- P18-T11 (SJ-150): where a clinical request is filled, who pays for it, and
-- the audit verbs that record a change to either.
--
-- Two enums rather than one combined flag, because who *performs* the work and
-- who *charges* for it are different questions. A klinik that sends blood to a
-- lab rujukan and then bills the patient itself with a markup is EXTERNAL on
-- the first and CLINIC on the second — a single value could not say that.
--
-- Split from the table changes that follow, as every enum addition in this
-- repo is: PostgreSQL cannot use a value in the transaction that added it, and
-- the columns below default to 'INTERNAL' and 'CLINIC'.

-- CreateEnum
CREATE TYPE "fulfilment_site" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "charge_mode" AS ENUM ('CLINIC', 'EXTERNAL', 'COVERED');

-- A billing dispute turns on these rows: "we were told the patient would buy
-- it outside" is answerable only if the change, the actor and the moment are
-- all recorded. A generic UPDATE row says none of that.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LAB_ORDER_DISPOSITION_CHANGED';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRESCRIPTION_DISPOSITION_CHANGED';
