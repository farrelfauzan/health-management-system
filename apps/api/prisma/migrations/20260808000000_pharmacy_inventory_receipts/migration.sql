-- Receipt rows replace the mutable medication aggregate as inventory source of truth.
ALTER TABLE "medications" ADD COLUMN "reorder_level" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "medication_stock_receipts" (
    "id" UUID NOT NULL,
    "medication_id" UUID NOT NULL,
    "batch_number" TEXT NOT NULL,
    "expiry_date" DATE,
    "quantity" INTEGER NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "medication_stock_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "medication_stock_receipts_quantity_check" CHECK ("quantity" > 0)
);

CREATE TABLE "dispense_item_stock_allocations" (
    "id" UUID NOT NULL,
    "dispense_item_id" UUID NOT NULL,
    "stock_receipt_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dispense_item_stock_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dispense_item_stock_allocations_quantity_check" CHECK ("quantity" > 0)
);

-- Historical aggregate balances have no reliable lot or expiry metadata. Keep
-- them usable but visibly unknown rather than inventing a clinical date.
INSERT INTO "medication_stock_receipts" (
    "id", "medication_id", "batch_number", "expiry_date", "quantity",
    "received_at", "received_by_id", "notes", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(), "id", 'LEGACY-UNKNOWN-EXPIRY', NULL, "stock_qty",
    "created_at", NULL, 'Backfilled from legacy medication stock quantity', NOW(), NOW()
FROM "medications"
WHERE "stock_qty" > 0;

ALTER TABLE "medications" DROP COLUMN "stock_qty";

CREATE INDEX "medications_reorder_level_idx" ON "medications"("reorder_level");
CREATE INDEX "medication_stock_receipts_medication_id_expiry_date_receive_idx"
    ON "medication_stock_receipts"("medication_id", "expiry_date", "received_at");
CREATE INDEX "medication_stock_receipts_expiry_date_idx"
    ON "medication_stock_receipts"("expiry_date");
CREATE INDEX "medication_stock_receipts_received_by_id_idx"
    ON "medication_stock_receipts"("received_by_id");
CREATE UNIQUE INDEX "dispense_item_stock_allocations_dispense_item_id_stock_rece_key"
    ON "dispense_item_stock_allocations"("dispense_item_id", "stock_receipt_id");
CREATE INDEX "dispense_item_stock_allocations_stock_receipt_id_idx"
    ON "dispense_item_stock_allocations"("stock_receipt_id");

ALTER TABLE "medications" ADD CONSTRAINT "medications_reorder_level_check" CHECK ("reorder_level" >= 0);
ALTER TABLE "medication_stock_receipts" ADD CONSTRAINT "medication_stock_receipts_medication_id_fkey"
    FOREIGN KEY ("medication_id") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "medication_stock_receipts" ADD CONSTRAINT "medication_stock_receipts_received_by_id_fkey"
    FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispense_item_stock_allocations" ADD CONSTRAINT "dispense_item_stock_allocations_dispense_item_id_fkey"
    FOREIGN KEY ("dispense_item_id") REFERENCES "dispense_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispense_item_stock_allocations" ADD CONSTRAINT "dispense_item_stock_allocations_stock_receipt_id_fkey"
    FOREIGN KEY ("stock_receipt_id") REFERENCES "medication_stock_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Inventory custody is intentionally separate from catalog maintenance and is
-- granted only to ADMIN and PHARMACIST.
INSERT INTO "permissions" ("id", "permission_key", "resource", "action", "scope", "description", "created_at", "updated_at")
VALUES
  (md5('permission:inventory.read:any')::uuid, 'inventory.read:any', 'Inventory', 'read', 'ANY', 'Read stock receipts and inventory reports', NOW(), NOW()),
  (md5('permission:inventory.write:any')::uuid, 'inventory.write:any', 'Inventory', 'write', 'ANY', 'Record medication stock receipts', NOW(), NOW())
ON CONFLICT ("permission_key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT
  md5('role-permission:' || r.code || ':' || p.permission_key)::uuid,
  r.id,
  p.id,
  NOW()
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code IN ('ADMIN', 'PHARMACIST')
  AND p.permission_key IN ('inventory.read:any', 'inventory.write:any')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
