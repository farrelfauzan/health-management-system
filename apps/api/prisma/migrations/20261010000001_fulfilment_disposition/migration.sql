-- P18-T11 (SJ-150): the disposition columns, and the invoice-line provenance
-- that turns "was this billed?" into a recorded fact.
--
-- Every default is chosen so that existing rows keep exactly the behaviour they
-- had before this migration: run here, billed here. Nothing about an invoice
-- already issued changes.

-- AlterTable
ALTER TABLE "lab_orders"
    ADD COLUMN "fulfilment_site" "fulfilment_site" NOT NULL DEFAULT 'INTERNAL',
    ADD COLUMN "charge_mode" "charge_mode" NOT NULL DEFAULT 'CLINIC',
    ADD COLUMN "external_facility_name" TEXT;

-- An order sent to an outside lab has to say which one — it is what the
-- referral letter prints (P18-T12) and what the cashier reads when explaining
-- why the test is not on this bill. An INTERNAL order naming an outside
-- facility is the contradictory state this rejects.
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_external_facility_check" CHECK (
    ("fulfilment_site" = 'EXTERNAL' AND "external_facility_name" IS NOT NULL)
    OR ("fulfilment_site" = 'INTERNAL' AND "external_facility_name" IS NULL)
);

-- AlterTable
ALTER TABLE "prescriptions"
    ADD COLUMN "fulfilment_site" "fulfilment_site" NOT NULL DEFAULT 'INTERNAL',
    ADD COLUMN "charge_mode" "charge_mode" NOT NULL DEFAULT 'CLINIC',
    ADD COLUMN "external_facility_name" TEXT;

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_external_facility_check" CHECK (
    ("fulfilment_site" = 'EXTERNAL' AND "external_facility_name" IS NOT NULL)
    OR ("fulfilment_site" = 'INTERNAL' AND "external_facility_name" IS NULL)
);

-- AlterTable
-- Provenance only, and `SET NULL` like `service_tariff_id` and `medication_id`
-- beside them: losing the source row must never take the billed line with it,
-- because the line is a financial snapshot of what was charged.
ALTER TABLE "invoice_items"
    ADD COLUMN "lab_order_id" UUID,
    ADD COLUMN "prescription_item_id" UUID;

-- CreateIndex
CREATE INDEX "invoice_items_lab_order_id_idx" ON "invoice_items"("lab_order_id");

-- CreateIndex
CREATE INDEX "invoice_items_prescription_item_id_idx" ON "invoice_items"("prescription_item_id");

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_prescription_item_id_fkey" FOREIGN KEY ("prescription_item_id") REFERENCES "prescription_medications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
