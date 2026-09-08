-- P18-T09 (SJ-86): the laboratory chain gets its own kind of outbox row.
--
-- Split from the table change that follows, as every enum addition in this
-- repo is: PostgreSQL cannot use a value in the transaction that added it.

-- CreateEnum
-- What a submission row reports. ENCOUNTER is the bundle written when a visit
-- closes; LAB_REPORT is the ServiceRequest/Specimen/Observation/DiagnosticReport
-- chain written when a lab order is released. Two kinds rather than two tables
-- because the claim, the lease, the backoff and the admin retry surface are the
-- same machinery — only the bundle differs.
CREATE TYPE "satusehat_submission_kind" AS ENUM ('ENCOUNTER', 'LAB_REPORT');
