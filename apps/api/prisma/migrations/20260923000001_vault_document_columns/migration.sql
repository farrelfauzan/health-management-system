-- AlterTable
ALTER TABLE "documents" ADD COLUMN "vault_category" "VaultDocumentCategory",
ADD COLUMN "reference_number" TEXT,
ADD COLUMN "issued_at" DATE,
ADD COLUMN "expires_at" DATE;

-- CreateTable
CREATE TABLE "vault_document_expiry_notices" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "threshold_days" INTEGER NOT NULL,
    "notified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_document_expiry_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One notice per document per threshold. A reminder job that runs twice must
-- not tell a doctor twice that their STR expires, so the second insert
-- conflicts rather than notifying.
CREATE UNIQUE INDEX "vault_document_expiry_notices_document_id_threshold_days_key" ON "vault_document_expiry_notices"("document_id", "threshold_days");

-- CreateIndex
CREATE INDEX "vault_document_expiry_notices_document_id_idx" ON "vault_document_expiry_notices"("document_id");

-- CreateIndex
CREATE INDEX "documents_owner_id_vault_category_idx" ON "documents"("owner_id", "vault_category");

-- CreateIndex
CREATE INDEX "documents_owner_id_expires_at_idx" ON "documents"("owner_id", "expires_at");

-- AddForeignKey
-- Cascade: the notice is bookkeeping about a document, and vault documents are
-- hard-deleted (FR-E3-09). When the document goes, the record of having
-- mentioned it goes with it.
ALTER TABLE "vault_document_expiry_notices" ADD CONSTRAINT "vault_document_expiry_notices_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written CHECKs, in the spirit of the PATIENT_CLINICAL ones above them:
-- which purposes use which columns is a database fact, not a service
-- convention. All existing rows satisfy these trivially — no row carries the
-- new purpose or the new columns yet.

-- Filing metadata belongs to a vault document and to nothing else. Without
-- this, a knowledge-base row could carry an `expires_at` and be picked up by
-- the reminder job (P16-T18), which would then notify a doctor about a file
-- that is not in their vault at all.
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_vault_columns_are_vault_check"
  CHECK (
    ("vault_category" IS NULL AND "reference_number" IS NULL
      AND "issued_at" IS NULL AND "expires_at" IS NULL)
    OR "purpose" = 'DOCTOR_VAULT'
  );

-- A vault always belongs to a person. `owner_id` is what every vault query
-- filters on and the only thing standing between one doctor's drawer and
-- another's, so a vault row without one is not a row the access rules can
-- classify — and CLINIC or PATIENT ownership would put personal paperwork in
-- a corpus that other people read.
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_doctor_vault_owner_check"
  CHECK (
    "purpose" <> 'DOCTOR_VAULT'
    OR ("owner_id" IS NOT NULL AND "owner_type" IN ('DOCTOR', 'ADMIN'))
  );

-- A licence cannot expire before it was issued. The API validates this first
-- and returns a readable 400 (P16-T17); this is the backstop that keeps a
-- direct writer from seeding a row the expiry job would reason about
-- backwards.
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_vault_expiry_after_issue_check"
  CHECK ("expires_at" IS NULL OR "issued_at" IS NULL OR "expires_at" >= "issued_at");
