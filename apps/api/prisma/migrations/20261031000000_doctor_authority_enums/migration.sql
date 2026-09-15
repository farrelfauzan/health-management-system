-- P25-T02, part A: the enum values behind a midwife's delegated authority
-- (kewenangan, Permenkes 28/2017 Pasal 23–26). In a folder of their own, ahead
-- of the table that uses them: Postgres will not let an enum value be added
-- and then referenced in the same transaction, and part B references all of
-- these. Stamped 20261031 by the orchestrator; parallel tickets take 20261101+.

-- CreateEnum
-- One value per grant a district decision letter can make. `NO_OTHER_WORKER`
-- is the broad authority for a place with no other health worker (Pasal 26).
CREATE TYPE "doctor_authority_kind" AS ENUM ('IUD_IMPLANT', 'MTBS', 'PROGRAM_IMMUNIZATION', 'INTEGRATED_ANC', 'NO_OTHER_WORKER');

-- AlterEnum
-- Three audit verbs rather than CREATE / UPDATE: each is a decision about what
-- a clinician may do, and the log has to read as one. Appended without AFTER
-- so the database's value order keeps matching schema.prisma.
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_AUTHORITY_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_AUTHORITY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_AUTHORITY_REVOKED';

-- AlterEnum
-- The clinic-side reminder pair (FR-AUTH-05), broadcast to whoever holds
-- `doctor.authority.read:any`. Separate from LICENCE_* because the feed
-- renders copy and a deep link per type.
ALTER TYPE "notification_type" ADD VALUE 'DOCTOR_AUTHORITY_EXPIRING';
ALTER TYPE "notification_type" ADD VALUE 'DOCTOR_AUTHORITY_EXPIRED';
