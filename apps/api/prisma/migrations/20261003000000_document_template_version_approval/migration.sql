-- P16-T32. The audit trail from an approver to the artefact their approval
-- released (NFR-AUD-03).
--
-- Nullable and `ON DELETE SET NULL`, deliberately. A version published
-- directly — the clinic that never turned approval on for INVOICE_TEMPLATE,
-- which is the default — has no decision to point at, and that is the normal
-- case rather than a gap. `SET NULL` rather than `RESTRICT` because the
-- version is the record that matters: a published layout real invoices
-- rendered from must survive whatever happens to the approval round, and a
-- FK that could block a round's deletion would put the trail ahead of the
-- artefact it describes.
ALTER TABLE "document_template_versions"
  ADD COLUMN "approval_decision_id" UUID;

ALTER TABLE "document_template_versions"
  ADD CONSTRAINT "document_template_versions_approval_decision_id_fkey"
  FOREIGN KEY ("approval_decision_id")
  REFERENCES "document_approval_decisions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "document_template_versions_approval_decision_id_idx"
  ON "document_template_versions"("approval_decision_id");
