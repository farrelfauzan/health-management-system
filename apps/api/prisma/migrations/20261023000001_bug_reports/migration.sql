-- The bug-report outbox (P23-T08). One row per report filed from the portal,
-- carried to the Notion Bug Board by the workers of P23-T09 and P23-T10.
--
-- The due index column order mirrors the claim predicate in
-- bug-report.repository.ts exactly, the way document_deliveries_due_idx does:
-- a claim that cannot use the index degrades to a sequential scan under the
-- one load where that matters.

-- CreateTable
CREATE TABLE "bug_reports" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "reporter_role" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "steps_to_reproduce" TEXT,
    "expected" TEXT,
    "actual" TEXT,
    "page_path" TEXT NOT NULL,
    "request_ids" TEXT[],
    "user_agent" TEXT NOT NULL,
    "app_version" TEXT,
    "acknowledged_no_sensitive_data_at" TIMESTAMP(3) NOT NULL,
    "status" "bug_report_status" NOT NULL DEFAULT 'RECEIVED',
    "triage" JSONB,
    "triaged_by" "bug_report_triaged_by",
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "leased_until" TIMESTAMP(3),
    "leased_by" TEXT,
    "last_error" TEXT,
    "notion_page_id" TEXT,
    "notion_page_url" TEXT,
    "published_at" TIMESTAMP(3),
    "held_at" TIMESTAMP(3),
    "content_purged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_report_counters" (
    "id" UUID NOT NULL,
    "next_value" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_report_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bug_reports_reference_key" ON "bug_reports"("reference");

-- CreateIndex
CREATE INDEX "bug_reports_due_idx" ON "bug_reports"("status", "next_attempt_at", "leased_until");

-- CreateIndex
CREATE INDEX "bug_reports_reporter_user_id_created_at_idx" ON "bug_reports"("reporter_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The BR- sequence starts at 1 for the single deployment. Seeded here, with a
-- nil UUID as the sentinel key, so a missing counter row is a loud error at
-- allocation time rather than an implicit insert that races: the allocator
-- deliberately does not create this row.
INSERT INTO "bug_report_counters" ("id", "next_value", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000000', 1, NOW())
ON CONFLICT ("id") DO NOTHING;
