-- P16-T25: the delivery pipeline's two enums and its audit verbs.
--
-- Split from the table migration that follows, as every enum addition in this
-- repo is: PostgreSQL cannot use a value in the transaction that added it.
--
-- `delivery_shape`: ATTACHMENT is the default on both channels and always a
-- password-protected PDF (D-027); LINK mints a revocable, expiring token.
-- `delivery_status`: the life of one send (FR-E4-12) plus CANCELLED, which
-- P16-T38's scheduled delivery needs and is cheaper to add here than in a
-- third enum migration. Seven audit verbs, one per act the PRD says must be
-- audited (FR-E4-18): the request, the transport outcome either way, an open
-- of a link, a revoke, a retry, and a cancel.

-- CreateEnum
CREATE TYPE "delivery_shape" AS ENUM ('ATTACHMENT', 'LINK');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'REVOKED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DELIVERY_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'DELIVERY_SENT';
ALTER TYPE "AuditAction" ADD VALUE 'DELIVERY_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'DELIVERY_OPENED';
ALTER TYPE "AuditAction" ADD VALUE 'DELIVERY_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE 'DELIVERY_RETRIED';
ALTER TYPE "AuditAction" ADD VALUE 'DELIVERY_CANCELLED';
