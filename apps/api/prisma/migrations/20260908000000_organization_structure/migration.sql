-- Organization structure (SJ-1). One self-referencing table: the org chart as
-- a single-parent adjacency list, with `path` materialised beside `parent_id`
-- so "everything under this unit" is a prefix scan rather than a recursive
-- query on every read. `path` holds the ancestor-id chain including the row
-- itself, slashed at both ends (`/root/child/`), which is what makes
-- `path LIKE '/root/%'` a subtree and `path` segment count a depth. The service
-- owns that column outright and recomputes the whole subtree inside the same
-- transaction as a move; nothing accepts it from a request.
--
-- No `depth` column on purpose: it is one line of code away from `path`, and a
-- second materialised copy of the same fact is a second thing that can drift
-- from `parent_id`.
--
-- Both foreign keys are RESTRICT rather than CASCADE. Deleting a unit must
-- never delete a person or silently orphan a subtree — the service refuses a
-- hard delete while children or members remain, and these constraints refuse it
-- again if that check is ever bypassed. Archiving (`deleted_at`) is the ordinary
-- path and touches neither.
--
-- `users.organization_unit_id` is nullable because the chart is optional
-- structure a clinic may never fill in, and because staff accounts must keep
-- working through a half-finished reorganisation.

-- CreateEnum
CREATE TYPE "organization_unit_kind" AS ENUM ('DIVISION', 'DEPARTMENT', 'TEAM', 'BRANCH');

-- AlterEnum
-- Five verbs rather than the generic CREATE/UPDATE/DELETE because the question
-- asked of the audit table afterwards is "who reorganised the clinic", and a
-- move is the one change that rewrites rows nobody edited.
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_UNIT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_UNIT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_UNIT_MOVED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_UNIT_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_UNIT_DELETED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "organization_unit_id" UUID;

-- CreateTable
CREATE TABLE "organization_units" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "kind" "organization_unit_kind" NOT NULL,
    "path" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "organization_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_units_parent_id_sort_order_idx" ON "organization_units"("parent_id", "sort_order");

-- CreateIndex
CREATE INDEX "organization_units_path_idx" ON "organization_units"("path");

-- CreateIndex
CREATE INDEX "organization_units_deleted_at_idx" ON "organization_units"("deleted_at");

-- CreateIndex
CREATE INDEX "users_organization_unit_id_idx" ON "users"("organization_unit_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_unit_id_fkey" FOREIGN KEY ("organization_unit_id") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A unit may not be its own parent. The service rejects cycles of any length
-- before it writes, walking the ancestor chain; this catches the one-hop case
-- at the database, where it costs nothing and cannot be bypassed. Longer cycles
-- are not expressible as a CHECK — an adjacency list can only see one edge from
-- here — which is why the service check is the real one.
ALTER TABLE "organization_units"
  ADD CONSTRAINT "organization_units_parent_not_self_check"
  CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
