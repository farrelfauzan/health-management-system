-- SJ-21: file-upload hardening.
--
-- One audit verb. Uploads are browser-direct presigned PUTs, so the first
-- moment the API can look at the bytes is confirm time — this value is what
-- a confirm that found a forged file (renamed executable, polyglot,
-- encrypted PDF) writes after deleting the object, so a pattern of forged
-- uploads by one account is countable afterwards.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_UPLOAD_REJECTED';
