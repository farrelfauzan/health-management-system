-- The two enums behind the bug-report outbox (P23-T08), split into their own
-- migration because Postgres will not let a type be created and used by a
-- table in the same transaction as some deployments run it.

-- CreateEnum
CREATE TYPE "bug_report_status" AS ENUM ('RECEIVED', 'TRIAGED', 'HELD', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "bug_report_triaged_by" AS ENUM ('AI', 'FALLBACK');
