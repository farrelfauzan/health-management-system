-- P16-T28: the lifecycle enum behind the documents registry.
--
-- Split from the table migration that follows, as every enum addition in this
-- repo is: PostgreSQL cannot use a value in the transaction that added it.
-- ISSUED is the only state a document is delivered or acted on from; a
-- PATIENT_BILL is born ISSUED because E1 generated it and nobody drafts one.

-- CreateEnum
CREATE TYPE "managed_document_status" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ISSUED', 'ARCHIVED');
