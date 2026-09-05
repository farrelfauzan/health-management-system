-- P16-T25: one attempt to put one rendered document in front of one patient
-- (FR-E4-12), and the revocable token behind a LINK delivery (FR-E4-11).
--
-- One table for invoices and, under P16-T40, released clinical documents
-- (D-028): the consent gate, the password lock, the worker and the timeline
-- are the same whichever document is inside. Exactly one subject is set —
-- the CHECK below is the same shape `invoices` uses for encounter-or-
-- admission. The full destination is never stored: `destination_masked` is
-- for display, and the number or address is re-resolved at send time
-- (FR-E4-10) from the verified link or the patient row.

-- CreateTable
CREATE TABLE "document_deliveries" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "invoice_id" UUID,
    "invoice_document_id" UUID,
    "document_id" UUID,
    "channel" "delivery_channel" NOT NULL,
    "shape" "delivery_shape" NOT NULL DEFAULT 'ATTACHMENT',
    "destination_masked" TEXT NOT NULL,
    "status" "delivery_status" NOT NULL DEFAULT 'QUEUED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "send_at" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "leased_until" TIMESTAMP(3),
    "leased_by" TEXT,
    "password_source" TEXT,
    "provider_message_id" TEXT,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "requested_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_deliveries_pkey" PRIMARY KEY ("id")
);

-- A delivery always says which document it carries, and never two. An
-- invoice delivery names the invoice and the rendered snapshot; a clinical
-- delivery names the document. Hand-written, as every CHECK in this repo is.
ALTER TABLE "document_deliveries" ADD CONSTRAINT "document_deliveries_subject_check" CHECK (
    ("invoice_id" IS NOT NULL AND "invoice_document_id" IS NOT NULL AND "document_id" IS NULL)
    OR ("invoice_id" IS NULL AND "invoice_document_id" IS NULL AND "document_id" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "document_delivery_links" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "last_opened_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_delivery_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The worker's claim predicate (P16-T26): due rows are QUEUED, past their
-- send_at and next_attempt_at, and not under a live lease.
CREATE INDEX "document_deliveries_due_idx" ON "document_deliveries"("status", "send_at", "next_attempt_at", "leased_until");

-- CreateIndex
CREATE INDEX "document_deliveries_invoice_id_created_at_idx" ON "document_deliveries"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "document_deliveries_document_id_created_at_idx" ON "document_deliveries"("document_id", "created_at");

-- CreateIndex
CREATE INDEX "document_deliveries_patient_id_created_at_idx" ON "document_deliveries"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "document_deliveries_invoice_document_id_idx" ON "document_deliveries"("invoice_document_id");

-- CreateIndex
CREATE INDEX "document_deliveries_requested_by_id_idx" ON "document_deliveries"("requested_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_delivery_links_delivery_id_key" ON "document_delivery_links"("delivery_id");

-- CreateIndex
-- The public route looks a token up by its hash; the hash is the only form
-- the token ever takes in this table.
CREATE UNIQUE INDEX "document_delivery_links_token_hash_key" ON "document_delivery_links"("token_hash");

-- CreateIndex
CREATE INDEX "document_delivery_links_expires_at_idx" ON "document_delivery_links"("expires_at");

-- AddForeignKey
-- Restrict: a delivery is evidence of what left the building; the patient,
-- the invoice, the snapshot and the clinical document it names all outlive
-- any attempt to remove them while a delivery row points at them.
ALTER TABLE "document_deliveries" ADD CONSTRAINT "document_deliveries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_deliveries" ADD CONSTRAINT "document_deliveries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_deliveries" ADD CONSTRAINT "document_deliveries_invoice_document_id_fkey" FOREIGN KEY ("invoice_document_id") REFERENCES "invoice_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_deliveries" ADD CONSTRAINT "document_deliveries_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull: the cashier who asked for the send may leave; the send stays.
ALTER TABLE "document_deliveries" ADD CONSTRAINT "document_deliveries_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- Cascade: the token is a property of its delivery and means nothing without it.
ALTER TABLE "document_delivery_links" ADD CONSTRAINT "document_delivery_links_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "document_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
