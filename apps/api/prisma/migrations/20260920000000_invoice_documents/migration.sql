-- CreateEnum
CREATE TYPE "InvoiceDocumentStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "invoice_documents" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "template_version_id" UUID,
    "has_void_watermark" BOOLEAN NOT NULL DEFAULT false,
    "was_bound_retroactively" BOOLEAN NOT NULL DEFAULT false,
    "rendered_data" JSONB NOT NULL,
    "status" "InvoiceDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "storage_key" TEXT,
    "checksum" TEXT,
    "size_bytes" INTEGER,
    "page_count" INTEGER,
    "render_warnings" JSONB NOT NULL DEFAULT '[]',
    "render_error" TEXT,
    "rendered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_documents_invoice_id_created_at_idx" ON "invoice_documents"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "invoice_documents_template_version_id_idx" ON "invoice_documents"("template_version_id");

-- CreateIndex
CREATE INDEX "invoice_documents_status_idx" ON "invoice_documents"("status");

-- AddForeignKey
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "document_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written indexes below. Prisma cannot express partial unique indexes
-- and `migrate diff` ignores them (same approach as
-- `invoices_encounter_id_live_key`). Together they make each render slot a
-- singleton: one plain and one void-watermarked document per (invoice,
-- template version), with the fallback (null version) rows covered by the
-- second index because Postgres treats NULLs as distinct in the first. This
-- is what stops two cashiers double-rendering: the second concurrent insert
-- dies here and the loser reads the winner's row.
CREATE UNIQUE INDEX "invoice_documents_render_slot_key" ON "invoice_documents" ("invoice_id", "template_version_id", "has_void_watermark") WHERE "template_version_id" IS NOT NULL;

CREATE UNIQUE INDEX "invoice_documents_fallback_render_slot_key" ON "invoice_documents" ("invoice_id", "has_void_watermark") WHERE "template_version_id" IS NULL;

-- Hand-written CHECK. A READY document is a stored object with a checksum;
-- a row claiming READY without either names bytes that cannot be served.
ALTER TABLE "invoice_documents"
  ADD CONSTRAINT "invoice_documents_ready_has_object"
  CHECK ("status" <> 'READY' OR ("storage_key" IS NOT NULL AND "checksum" IS NOT NULL));
