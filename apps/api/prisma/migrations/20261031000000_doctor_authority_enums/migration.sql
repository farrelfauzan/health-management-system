-- P25-T02, part A: the enum values behind a midwife's delegated authority
-- (kewenangan), shaped by D-036 (docs/post-mvp/decisions.md). In a folder of
-- their own, ahead of the table that uses them: Postgres will not let an enum
-- value be added and then referenced in the same transaction, and part B
-- references all of these. Stamped 20261031 by the orchestrator; parallel
-- tickets take 20261101+.

-- CreateEnum
-- One value per action an authority covers. Which actions need one is still
-- the Permenkes 28/2017 Pasal 25 list, kept as the reference by Permenkes
-- 13/2025 Pasal 305(1). `NO_OTHER_WORKER` is the authority for a place with no
-- other health worker (PP 28/2024 Pasal 744(2)(a), Permenkes 13/2025 Pasal 186).
CREATE TYPE "doctor_authority_kind" AS ENUM ('IUD_IMPLANT', 'MTBS', 'PROGRAM_IMMUNIZATION', 'INTEGRATED_ANC', 'NO_OTHER_WORKER');

-- CreateEnum
-- The evidence a grant rests on, one per authority: a dinas kesehatan
-- penetapan (PP 28/2024 Pasal 744(3), Permenkes 13/2025 Pasal 186), a
-- government penugasan after training (Permenkes 13/2025 Pasal 187(2)), or a
-- training-added competence written on the STR (PP 28/2024 Pasal 742(3)–(4)).
CREATE TYPE "doctor_authority_grant_kind" AS ENUM ('DINAS_PENETAPAN', 'GOVERNMENT_PENUGASAN', 'STR_ANNOTATION');

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
