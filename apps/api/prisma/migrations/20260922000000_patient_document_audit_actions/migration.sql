-- P16-T08: patient clinical document API.
--
-- Two audit verbs beyond the generic READ/CREATE/UPDATE/DELETE. A download
-- is the moment file bytes left the system for a device, and a release is
-- the moment a result became visible in the patient portal (FR-E2-07,
-- FR-E2-13) — both are written imperatively by the service with episode
-- context the route interceptor never sees.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_DOCUMENT_DOWNLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_DOCUMENT_RELEASED';
