-- SJ-4: turn the audit log into an append-only record of patient-data access.
--
-- Three things happen here, in order of how much they matter: the table gains
-- the columns that make "who read this patient's chart, when, from where"
-- answerable in one query; it loses the foreign key that let a user deletion
-- rewrite it; and it gains a trigger that refuses UPDATE, DELETE and TRUNCATE
-- from anybody the database has not made a superuser.

-- AlterEnum
-- The five generic verbs the `@Audited()` interceptor writes. Every existing
-- value names a specific business event; these name what was done to
-- patient-identifiable data. READ is one of them because the regulatory
-- question is who looked, not only who changed.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'READ';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CREATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'UPDATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DELETE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPORT';

-- AlterTable
-- `actor_role` and `patient_id` are denormalised on purpose. A join would
-- answer a *different* question: what roles the actor holds now, not what they
-- held when they looked. `ip_address` is text rather than INET because it also
-- carries the proxy-resolved value, and a malformed forwarded header must be
-- recordable rather than fatal.
ALTER TABLE "audit_logs"
  ADD COLUMN "actor_role" TEXT,
  ADD COLUMN "patient_id" UUID,
  ADD COLUMN "ip_address" TEXT;

-- DropForeignKey
-- An immutable log cannot hold a foreign key to a mutable table. `ON DELETE
-- SET NULL` is an UPDATE on this table, so a hard delete of a `users` row
-- would either erase who did what or — once the trigger below exists — fail
-- the deletion outright. Neither is acceptable, and the column is retained as
-- a plain identifier: the actor is still named, the row just no longer depends
-- on that name surviving elsewhere.
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_actor_user_id_fkey";

-- CreateIndex
-- The primary access-history query, and the correlation index that ties an
-- audit row back to the request that produced it and to the application logs
-- carrying the same X-Request-Id.
CREATE INDEX "audit_logs_patient_id_occurred_at_idx" ON "audit_logs"("patient_id", "occurred_at");
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- Append-only enforcement.
--
-- The ticket calls for `REVOKE UPDATE, DELETE, TRUNCATE ... FROM hms_app`, and
-- that revoke ships below — but on its own it is not enough to test against,
-- and on many deployments not enough to rely on. REVOKE has no effect on the
-- table's owner, and in development and CI the application connects as the
-- owner; the split runtime/migration roles that make the grant meaningful are
-- SJ-11's work and have not landed. A trigger binds regardless of who is
-- connected, so the guarantee is testable today and survives a future where
-- somebody points the app at the database as a superuser by mistake.
--
-- The two mechanisms are complementary, not redundant: the trigger stops the
-- application, the revoke stops anything that could drop the trigger.
CREATE OR REPLACE FUNCTION "reject_audit_log_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_reject_update"
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "reject_audit_log_mutation"();

CREATE TRIGGER "audit_logs_reject_delete"
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "reject_audit_log_mutation"();

-- TRUNCATE bypasses row-level triggers entirely, so it needs its own
-- statement-level one. Without this, the whole history is one command away.
CREATE TRIGGER "audit_logs_reject_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_audit_log_mutation"();

-- The grant-level half, applied only where SJ-11's runtime role already
-- exists. Written as a conditional block because the same migration has to run
-- against a development database that has no such role, and a hard REVOKE
-- against a missing role aborts the migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hms_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM "hms_app";
  END IF;
END $$;
