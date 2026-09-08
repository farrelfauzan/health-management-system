-- P18-T05 (SJ-145): the hasil laboratorium as a rendered document.
--
-- Split from the table that follows, as every enum addition in this repo is:
-- PostgreSQL cannot use a value in the transaction that added it.

-- CreateEnum
-- PENDING is a row the worker will claim; FAILED is one it gave up on after
-- the last retry, visible on the order and re-queued by the next amendment.
CREATE TYPE "lab_report_status" AS ENUM ('PENDING', 'READY', 'FAILED');

-- AlterEnum
-- A fourth template kind beside the invoice and the two printed requests: the
-- report a clinic may restyle without a code change, rendered from the
-- released results and never drafted.
ALTER TYPE "DocumentTemplateKind" ADD VALUE IF NOT EXISTS 'LAB_REPORT';

-- AlterEnum
-- One event per version filed: a report and the amended one that replaced it
-- are two events, and "which sheet did the patient get" is answered here.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LAB_REPORT_FILED';
