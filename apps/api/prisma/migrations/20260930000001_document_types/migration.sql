-- P16-T39: document types as master data the clinic manages (FR-E5-31), and
-- the default approvers that pre-fill a drafter's picker (FR-E5-38).
--
-- `code` is the stable machine identity and is unique; `name` is display and
-- freely editable, and two types may share one (FR-E5-37, §7.5.10). Seeded
-- rows are marked `is_system` and their `code`/`behavior` are refused for
-- mutation by the service, exactly as seeded roles are. The approval policy
-- lives on the row — there is no policy table (FR-E5-34).

-- CreateTable
CREATE TABLE "document_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "behavior" "document_type_behavior" NOT NULL DEFAULT 'GENERIC',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_approval_required" BOOLEAN NOT NULL DEFAULT false,
    "allow_self_approval" BOOLEAN NOT NULL DEFAULT false,
    "required_approvals" INTEGER NOT NULL DEFAULT 1,
    "requires_patient" BOOLEAN NOT NULL DEFAULT false,
    "requires_doctor" BOOLEAN NOT NULL DEFAULT false,
    "content_mode" "document_content_mode" NOT NULL DEFAULT 'EITHER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- A type that requires approval requires at least one; a type that does not
-- still carries a sensible count for the day the policy is switched on.
-- Hand-written, as every CHECK in this repo is.
ALTER TABLE "document_types" ADD CONSTRAINT "document_types_required_approvals_check" CHECK ("required_approvals" >= 1);

-- CreateTable
CREATE TABLE "document_type_approvers" (
    "id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,

    CONSTRAINT "document_type_approvers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- CreateIndex
-- The picker's one read: live types, in the clinic's order.
CREATE INDEX "document_types_is_active_sort_order_idx" ON "document_types"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "document_type_approvers_type_id_approver_id_key" ON "document_type_approvers"("type_id", "approver_id");

-- CreateIndex
CREATE INDEX "document_type_approvers_approver_id_idx" ON "document_type_approvers"("approver_id");

-- AddForeignKey
-- Cascade both ways: a default approver is bookkeeping about a type and a
-- person, and means nothing once either is gone.
ALTER TABLE "document_type_approvers" ADD CONSTRAINT "document_type_approvers_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "document_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_type_approvers" ADD CONSTRAINT "document_type_approvers_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
