-- P18-T05 (SJ-145): one rendering of the hasil laboratorium per release and
-- per amendment.
--
-- A row per version rather than a column on the order, never overwritten: the
-- sheet a patient was handed is the sheet the record has to be able to show,
-- beside the corrected one an amendment produced. The row is also the job the
-- worker claims — release writes PENDING and must not wait on the renderer.

-- CreateTable
CREATE TABLE "lab_reports" (
    "id" UUID NOT NULL,
    "lab_order_id" UUID NOT NULL,
    -- v1 is queued by the release; every amendment queues the next.
    "version" INTEGER NOT NULL,
    "status" "lab_report_status" NOT NULL DEFAULT 'PENDING',
    "is_amended" BOOLEAN NOT NULL DEFAULT false,
    -- The order's release time this version reports, snapshotted when queued:
    -- the order may be released again before the worker reaches this row.
    "released_at" TIMESTAMP(3) NOT NULL,
    "document_id" UUID,
    "template_version_id" UUID,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "leased_until" TIMESTAMP(3),
    "leased_by" TEXT,
    "last_error" TEXT,
    "rendered_at" TIMESTAMP(3),
    "page_count" INTEGER,
    "requested_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_reports_pkey" PRIMARY KEY ("id")
);

-- A READY row is a row with a file. A row that says it rendered and points at
-- nothing is the state the download route must never meet.
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_ready_has_document_check" CHECK (
    ("status" <> 'READY') OR ("document_id" IS NOT NULL)
);

-- CreateIndex
-- A document is the rendering of exactly one report version.
CREATE UNIQUE INDEX "lab_reports_document_id_key" ON "lab_reports"("document_id");

-- CreateIndex
-- One row per version per order: a release and an amendment racing cannot
-- both claim v2.
CREATE UNIQUE INDEX "lab_reports_lab_order_id_version_key" ON "lab_reports"("lab_order_id", "version");

-- CreateIndex
CREATE INDEX "lab_reports_lab_order_id_created_at_idx" ON "lab_reports"("lab_order_id", "created_at");

-- CreateIndex
-- The worker's claim query: due PENDING rows, oldest first.
CREATE INDEX "lab_reports_status_next_attempt_at_idx" ON "lab_reports"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "lab_reports_template_version_id_idx" ON "lab_reports"("template_version_id");

-- CreateIndex
CREATE INDEX "lab_reports_requested_by_id_idx" ON "lab_reports"("requested_by_id");

-- AddForeignKey
-- Reports live and die with the order they render, as results do.
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL: a retention purge that removes the PDF must not take the fact
-- that a report was issued with it.
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT: a published layout that rendered a filed report is part of how
-- that report is read back, and cannot be deleted out from under it.
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "document_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT: the account whose signature issued a report cannot be deleted out
-- from under the row that names it.
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
