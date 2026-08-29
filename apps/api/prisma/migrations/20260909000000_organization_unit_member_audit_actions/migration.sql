-- Membership audit verbs (SJ-89). Separate from SJ-1's five structure verbs
-- because they answer to a different permission and a different person: those
-- record who redrew the chart, these record who was moved between its boxes.
-- Its own migration rather than an amendment to 20260908000000, which is
-- already applied — an applied migration is never edited.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_UNIT_MEMBER_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_UNIT_MEMBER_UNASSIGNED';
