-- A PAID invoice's PDF showed status ISSUED with empty payment details: the
-- snapshot cut at issue was reused for every later render, and recording a
-- payment never cut a new one. The issued snapshot must stay byte-identical
-- (FR-E1-09), so the paid receipt becomes its own render slot, the same way
-- the VOID watermark already is.

-- AlterTable
ALTER TABLE "invoice_documents" ADD COLUMN "is_paid_receipt" BOOLEAN NOT NULL DEFAULT false;

-- Hand-written below. Prisma cannot express partial unique indexes or CHECK
-- constraints and `migrate diff` ignores them.
DROP INDEX "invoice_documents_render_slot_key";

DROP INDEX "invoice_documents_fallback_render_slot_key";

-- Rows cut before this migration all sit in the un-watermarked slot. The ones
-- whose frozen values already say PAID were cut at first render after the
-- payment (an invoice issued before document templates, or one whose
-- issue-time snapshot failed): they are paid receipts, and reclassifying them
-- changes no byte of what they render.
UPDATE "invoice_documents"
SET "is_paid_receipt" = true
WHERE "has_void_watermark" = false
  AND "rendered_data" -> 'values' ->> 'invoice.status' = 'PAID';

-- One document per (invoice, template version, slot), where the slot is the
-- pair (has_void_watermark, is_paid_receipt). The fallback (null version)
-- rows need the second index because Postgres treats NULLs as distinct in the
-- first.
CREATE UNIQUE INDEX "invoice_documents_render_slot_key" ON "invoice_documents" ("invoice_id", "template_version_id", "has_void_watermark", "is_paid_receipt") WHERE "template_version_id" IS NOT NULL;

CREATE UNIQUE INDEX "invoice_documents_fallback_render_slot_key" ON "invoice_documents" ("invoice_id", "has_void_watermark", "is_paid_receipt") WHERE "template_version_id" IS NULL;

-- A VOID invoice is never paid and a PAID one is never voided (PAID is
-- terminal), so no document is both a watermarked render and a receipt.
ALTER TABLE "invoice_documents"
  ADD CONSTRAINT "invoice_documents_single_slot"
  CHECK (NOT ("has_void_watermark" AND "is_paid_receipt"));
