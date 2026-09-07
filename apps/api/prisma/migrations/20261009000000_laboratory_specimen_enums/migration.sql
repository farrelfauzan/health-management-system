-- P18-T03 (SJ-143): the specimen enums, and the audit verbs the collection
-- routes write.
--
-- Split from the table that follows, as every enum addition in this repo is:
-- PostgreSQL cannot use a value in the transaction that added it, and
-- `lab_specimens.status` defaults to 'COLLECTED'.

-- CreateEnum
CREATE TYPE "lab_specimen_status" AS ENUM ('COLLECTED', 'RECEIVED', 'REJECTED');

-- CreateEnum
-- A closed list rather than free text: the question a clinic asks of this
-- column is "which of these keeps happening", and prose cannot be counted.
CREATE TYPE "lab_specimen_reject_reason" AS ENUM ('HEMOLYSED', 'INSUFFICIENT', 'CLOTTED', 'MISLABELLED', 'CONTAMINATED', 'OTHER');

-- A rejected tube is the event a disputed result is read backwards from, so it
-- gets its own verb rather than an UPDATE row.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LAB_SPECIMEN_COLLECTED';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LAB_SPECIMEN_RECEIVED';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LAB_SPECIMEN_REJECTED';
