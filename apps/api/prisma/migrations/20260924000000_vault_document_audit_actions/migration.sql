-- P16-T17: doctor vault API.
--
-- Two audit verbs beyond the generic READ/CREATE/UPDATE/DELETE, for the same
-- reason P16-T08 added its two: they answer questions the generic verbs
-- cannot. A download is the moment one document's bytes left the system for a
-- device; an export is the moment an entire vault did, in one file.
--
-- These rows exist for the owner, not for an auditor watching them. Nobody
-- else can read a vault, so the only person an access log here can inform is
-- the person whose documents they are.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'VAULT_DOCUMENT_DOWNLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'VAULT_DOCUMENT_EXPORTED';
