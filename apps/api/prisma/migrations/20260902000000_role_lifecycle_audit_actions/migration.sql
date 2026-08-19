-- IMP-2: role lifecycle audit.
--
-- Role assignment has been on the record since ROLE_ASSIGNED / ROLE_UNASSIGNED;
-- role *lifecycle* — a role being created, renamed, deleted, or having its
-- permission set changed — was not. These four verbs close that gap so the
-- question "who made this role able to do X, and when" has an answer.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ROLE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ROLE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ROLE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'ROLE_PERMISSIONS_CHANGED';
