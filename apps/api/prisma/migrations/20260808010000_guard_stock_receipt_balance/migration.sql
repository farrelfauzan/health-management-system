-- `remaining_quantity` is the serialized mutable balance. Receipt `quantity`
-- remains the immutable amount received and allocation rows remain provenance.
ALTER TABLE "medication_stock_receipts"
ADD COLUMN "remaining_quantity" INTEGER;

UPDATE "medication_stock_receipts" receipt
SET "remaining_quantity" = receipt."quantity" - COALESCE((
    SELECT SUM(allocation."quantity")::INTEGER
    FROM "dispense_item_stock_allocations" allocation
    WHERE allocation."stock_receipt_id" = receipt."id"
), 0);

ALTER TABLE "medication_stock_receipts"
ALTER COLUMN "remaining_quantity" SET NOT NULL;

ALTER TABLE "medication_stock_receipts"
ADD CONSTRAINT "medication_stock_receipts_remaining_quantity_check"
CHECK ("remaining_quantity" >= 0 AND "remaining_quantity" <= "quantity");

CREATE INDEX "medication_stock_receipts_medication_id_remaining_quantity_expiry_date_idx"
ON "medication_stock_receipts"("medication_id", "remaining_quantity", "expiry_date");
