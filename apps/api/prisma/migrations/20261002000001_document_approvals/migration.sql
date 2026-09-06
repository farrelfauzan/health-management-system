-- P16-T29: the approval engine (FR-E5-08…18). Three tables: the round, the
-- panel named on it, and the decisions recorded against it.
--
-- Two hand-written constraints carry the invariants the service must never be
-- the only thing enforcing:
--
--   * a **partial unique index** allowing at most one PENDING round per
--     document, so a double-submitted form cannot open two rounds racing each
--     other to issue the same document; and
--   * a CHECK requiring a reason on a rejection (FR-E5-17) — "returned to
--     draft" with no explanation is exactly the failure the requirement
--     exists to prevent.
--
-- `frozen_payload` is the content and the approver set as submitted. An
-- approver approves a specific artefact reviewed by a specific panel, and
-- approval releases *that* version (FR-E5-16), not whatever the row says when
-- the button is pressed.

-- CreateTable
CREATE TABLE "document_approval_requests" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "frozen_payload" JSONB NOT NULL,
    "status" "document_approval_status" NOT NULL DEFAULT 'PENDING',
    "submitted_by_id" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "due_soon_notified_at" TIMESTAMP(3),
    "overdue_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_approval_approvers" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,

    CONSTRAINT "document_approval_approvers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_approval_decisions" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "is_approved" BOOLEAN NOT NULL,
    "reason" TEXT,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_approval_decisions_pkey" PRIMARY KEY ("id")
);

-- A rejection always carries a reason, and it stays in the document's history
-- forever (FR-E5-17, US-E5-03).
ALTER TABLE "document_approval_decisions" ADD CONSTRAINT "document_approval_decisions_reason_check" CHECK (
    "is_approved" OR ("reason" IS NOT NULL AND btrim("reason") <> '')
);

-- At most one open round per document. The service checks this too; the index
-- is what makes a double submit impossible rather than merely unlikely.
CREATE UNIQUE INDEX "document_approval_requests_one_pending_per_document"
    ON "document_approval_requests"("document_id")
    WHERE "status" = 'PENDING';

-- CreateIndex
CREATE INDEX "document_approval_requests_status_due_at_idx" ON "document_approval_requests"("status", "due_at");

-- CreateIndex
CREATE INDEX "document_approval_requests_document_id_submitted_at_idx" ON "document_approval_requests"("document_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_approval_approvers_request_id_approver_id_key" ON "document_approval_approvers"("request_id", "approver_id");

-- CreateIndex
CREATE INDEX "document_approval_approvers_approver_id_idx" ON "document_approval_approvers"("approver_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_approval_decisions_request_id_approver_id_key" ON "document_approval_decisions"("request_id", "approver_id");

-- CreateIndex
CREATE INDEX "document_approval_decisions_approver_id_idx" ON "document_approval_decisions"("approver_id");

-- AddForeignKey
ALTER TABLE "document_approval_requests" ADD CONSTRAINT "document_approval_requests_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "managed_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_approval_requests" ADD CONSTRAINT "document_approval_requests_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_approval_approvers" ADD CONSTRAINT "document_approval_approvers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "document_approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_approval_approvers" ADD CONSTRAINT "document_approval_approvers_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_approval_decisions" ADD CONSTRAINT "document_approval_decisions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "document_approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_approval_decisions" ADD CONSTRAINT "document_approval_decisions_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
