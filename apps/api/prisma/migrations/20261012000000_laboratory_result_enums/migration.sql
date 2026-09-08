-- P18-T04 (SJ-144): how a measured value is flagged, the two bells a result
-- rings, and the verbs that record who typed a number and who signed it out.
--
-- Split from the tables that follow, as every enum addition in this repo is:
-- PostgreSQL cannot use a value in the transaction that added it.

-- CreateEnum
-- CRITICAL_LOW and CRITICAL_HIGH are not "very abnormal" — they are the values
-- a lab must telephone, and the reason a notification is raised on entry
-- rather than on release. ABNORMAL is the TEXT/CODED counterpart, where
-- "abnormal" is all a non-numeric result can say.
CREATE TYPE "lab_result_flag" AS ENUM ('NORMAL', 'LOW', 'HIGH', 'CRITICAL_LOW', 'CRITICAL_HIGH', 'ABNORMAL');

-- AlterEnum
-- Fired on entry, before verification: a critical value does not wait for a
-- second signature.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'LAB_RESULT_CRITICAL';

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'LAB_RESULT_RELEASED';

-- Three verbs and not one UPDATE, because the questions asked afterwards are
-- different questions: who typed this number, who signed it out, and who
-- corrected it after it had already been acted on.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LAB_RESULT_ENTERED';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LAB_RESULT_RELEASED';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LAB_RESULT_AMENDED';
