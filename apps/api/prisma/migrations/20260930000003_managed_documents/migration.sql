-- P16-T28: the documents registry (FR-E5-01…05). One row per document the
-- clinic drafts, approves and issues, of a type the clinic manages.
--
-- Two hand-written CHECKs carry the model's invariants: a document is drafted
-- or uploaded, never both (and the stored object's metadata travels with the
-- key); and a row governs at most one subject — a template, a store
-- document, or an invoice — the `invoices` encounter-or-admission shape. Every
-- foreign key is RESTRICT: a registry row is the clinic's record of what it
-- issued, and nothing it points at may be removed out from under it. That is
-- also what surfaces FR-E5-36's "deactivate instead" for a type in use.

-- CreateTable
CREATE TABLE "managed_documents" (
    "id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "status" "managed_document_status" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "document_number" TEXT,
    "content_html" TEXT,
    "storage_key" TEXT,
    "storage_mime_type" TEXT,
    "storage_size_bytes" INTEGER,
    "patient_id" UUID,
    "doctor_id" UUID,
    "subject_template_id" UUID,
    "subject_document_id" UUID,
    "subject_invoice_id" UUID,
    "drafted_by_id" UUID NOT NULL,
    "issued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "managed_documents_pkey" PRIMARY KEY ("id")
);

-- Drafted or uploaded, never both. Neither is allowed to be a blank draft
-- with nothing behind it, so an empty draft carries content_html = '' rather
-- than NULL. The stored object's type and size are set exactly when the key
-- is (P16-T36).
ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_content_check" CHECK (
    NOT ("content_html" IS NOT NULL AND "storage_key" IS NOT NULL)
    AND (("storage_key" IS NOT NULL) = ("storage_mime_type" IS NOT NULL))
    AND (("storage_key" IS NOT NULL) = ("storage_size_bytes" IS NOT NULL))
);

-- At most one subject.
ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_subject_check" CHECK (
    (CASE WHEN "subject_template_id" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "subject_document_id" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "subject_invoice_id" IS NOT NULL THEN 1 ELSE 0 END) <= 1
);

-- CreateIndex
CREATE INDEX "managed_documents_type_id_status_created_at_idx" ON "managed_documents"("type_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "managed_documents_status_issued_at_idx" ON "managed_documents"("status", "issued_at");

-- CreateIndex
CREATE INDEX "managed_documents_patient_id_idx" ON "managed_documents"("patient_id");

-- CreateIndex
CREATE INDEX "managed_documents_doctor_id_idx" ON "managed_documents"("doctor_id");

-- CreateIndex
CREATE INDEX "managed_documents_drafted_by_id_idx" ON "managed_documents"("drafted_by_id");

-- CreateIndex
CREATE INDEX "managed_documents_subject_template_id_idx" ON "managed_documents"("subject_template_id");

-- CreateIndex
CREATE INDEX "managed_documents_subject_document_id_idx" ON "managed_documents"("subject_document_id");

-- CreateIndex
CREATE INDEX "managed_documents_subject_invoice_id_idx" ON "managed_documents"("subject_invoice_id");

-- CreateIndex
CREATE INDEX "managed_documents_deleted_at_idx" ON "managed_documents"("deleted_at");

-- AddForeignKey
ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_drafted_by_id_fkey" FOREIGN KEY ("drafted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_subject_template_id_fkey" FOREIGN KEY ("subject_template_id") REFERENCES "document_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_subject_document_id_fkey" FOREIGN KEY ("subject_document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_subject_invoice_id_fkey" FOREIGN KEY ("subject_invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
