-- P27-T12 (SJ-253): the stored PDF of a finalized monthly tax report. One row
-- per report; READY is served as is on every later download, FAILED is
-- rendered again. Additive.

-- CreateEnum
CREATE TYPE "tax_report_document_status" AS ENUM ('READY', 'FAILED');

-- CreateTable
CREATE TABLE "tax_report_documents" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "status" "tax_report_document_status" NOT NULL,
    "storage_key" TEXT,
    "checksum" TEXT,
    "size_bytes" INTEGER,
    "failure_reason" TEXT,
    "rendered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_report_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_report_documents_report_id_key" ON "tax_report_documents"("report_id");

-- AddForeignKey
ALTER TABLE "tax_report_documents" ADD CONSTRAINT "tax_report_documents_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "tax_report_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A READY row always points at its file.
ALTER TABLE "tax_report_documents" ADD CONSTRAINT "tax_report_documents_ready_has_file_check"
  CHECK ("status" <> 'READY' OR ("storage_key" IS NOT NULL AND "checksum" IS NOT NULL AND "size_bytes" IS NOT NULL AND "rendered_at" IS NOT NULL));
