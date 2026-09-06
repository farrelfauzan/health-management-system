-- P16-T39: the two enums behind document-type master data, and the audit
-- verbs a type's approval policy writes.
--
-- Split from the table migration that follows, as every enum addition in this
-- repo is: PostgreSQL cannot use a value in the transaction that added it.
--
-- `document_type_behavior` is bounded even though types are unbounded: a
-- clinic can invent a document type, it cannot invent a handler (§7.5.2.1).
-- `document_content_mode` says whether a document of the type is drafted in
-- the editor, uploaded as a file, or either (FR-E5-35). The two audit verbs
-- are NFR-AUD-03: any change to a type's approval settings, and the one
-- setting that lets a drafter approve their own work (FR-E5-14).

-- CreateEnum
CREATE TYPE "document_type_behavior" AS ENUM ('GENERIC', 'INVOICE_TEMPLATE', 'CLINIC_CORPUS', 'PATIENT_BILL');

-- CreateEnum
CREATE TYPE "document_content_mode" AS ENUM ('DRAFTED', 'UPLOADED', 'EITHER');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'APPROVAL_POLICY_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'SELF_APPROVAL_ENABLED';
