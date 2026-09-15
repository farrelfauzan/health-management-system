-- P25-T03, part A: the enum values behind midwife authority enforcement. In a
-- folder of their own, ahead of the columns that use them: Postgres will not
-- let an enum value be added and then referenced in the same transaction.
-- Stamped 20261103 by the orchestrator (T02 took 20261031, T04 20261101,
-- P24-T12 20261102).

-- CreateEnum
-- Why a midwife is seeing a child under five. Only SICK_CHILD needs MTBS.
CREATE TYPE "encounter_child_visit_purpose" AS ENUM ('WELL_CHILD', 'NEONATAL_FIRST_AID', 'SICK_CHILD');

-- CreateEnum
-- No ICD-9-CM code names a contraceptive implant, so a procedure carries this
-- flag until P25-T14 gates by KB method.
CREATE TYPE "contraceptive_implant_action" AS ENUM ('INSERTION', 'REMOVAL');

-- AlterEnum
-- Written before the 422 because AuditInterceptor never logs a 4xx. Appended
-- without AFTER so the database's value order keeps matching schema.prisma.
ALTER TYPE "AuditAction" ADD VALUE 'MIDWIFE_AUTHORITY_REFUSED';
