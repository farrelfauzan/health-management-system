-- P18-T12 (SJ-151): the link from a clinical request to its printed letter.
--
-- One document per request, re-rendered on reprint, so "the letter for this
-- order" is one column read rather than a search through the patient's files.
-- The document itself is an ordinary patient clinical file (purpose
-- PATIENT_CLINICAL, category REFERRAL_LETTER) — no second store, and it shows
-- up in the patient's document list like anything else filed on the visit.

-- AlterTable
ALTER TABLE "lab_orders" ADD COLUMN "request_document_id" UUID;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN "document_id" UUID;

-- CreateIndex
-- Unique rather than a plain index: a document is the printout of exactly one
-- request, and two requests pointing at one file would mean one of them is
-- printing somebody else's tests.
CREATE UNIQUE INDEX "lab_orders_request_document_id_key" ON "lab_orders"("request_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_document_id_key" ON "prescriptions"("document_id");

-- AddForeignKey
-- SET NULL: a retention purge that removes the file must not take the clinical
-- record with it. The order survives without its printout, which is the
-- correct outcome — the order is the instruction, the letter is only paper.
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_request_document_id_fkey" FOREIGN KEY ("request_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
