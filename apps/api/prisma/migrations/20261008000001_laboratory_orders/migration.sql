-- P18-T02 (SJ-142): the lab order and its items.
--
-- The order is the unit everything later in P18 attaches to — the specimen is
-- drawn for it, the result is entered against its items, the invoice line is
-- priced from it, and the SATUSEHAT ServiceRequest is it.

-- CreateTable
-- The `invoice_counters` pattern, applied to the bench: allocation is one
-- atomic INSERT … ON CONFLICT … RETURNING inside the create transaction, never
-- MAX + 1, which races when two doctors order at the same moment. A
-- rolled-back create returns its number; a committed one is never reissued.
CREATE TABLE "lab_order_counters" (
    "order_date" DATE NOT NULL,
    "next_value" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_order_counters_pkey" PRIMARY KEY ("order_date")
);

-- CreateTable
CREATE TABLE "lab_orders" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    -- Denormalised from the encounter, as `immunizations.patient_id` is: a
    -- patient's lab history is one indexed read, and it is the fact that
    -- outlives the visit.
    "patient_id" UUID NOT NULL,
    "ordered_by_id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "status" "lab_order_status" NOT NULL DEFAULT 'ORDERED',
    "priority" "lab_order_priority" NOT NULL DEFAULT 'ROUTINE',
    -- The only clinical text the lab worklist shows (P18-T03). Everything else
    -- on the encounter — SOAP, diagnoses — is none of the bench's business.
    "clinical_notes" TEXT,
    "is_fasting" BOOLEAN NOT NULL DEFAULT false,
    "recollect_count" INTEGER NOT NULL DEFAULT 0,
    "ordered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "released_at" TIMESTAMP(3),
    "satusehat_service_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id")
);

-- A cancellation without a reason is the state this table must never hold: it
-- is what a disputed "why was my test not run" is answered from.
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_cancel_reason_check" CHECK (
    ("status" <> 'CANCELLED') OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL)
);

ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_recollect_count_check" CHECK ("recollect_count" >= 0);

-- CreateTable
CREATE TABLE "lab_order_items" (
    "id" UUID NOT NULL,
    "lab_order_id" UUID NOT NULL,
    "lab_test_id" UUID NOT NULL,
    -- The panel this row was expanded from, or NULL when the test was ordered
    -- loose. Panels are expanded at order time so a later membership edit never
    -- rewrites history, and billing (P18-T06) groups on this to price the panel
    -- once rather than six times.
    "panel_id" UUID,
    "specimen_id" UUID,
    "status" "lab_order_item_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lab_orders_order_number_key" ON "lab_orders"("order_number");

-- CreateIndex
CREATE INDEX "lab_orders_encounter_id_idx" ON "lab_orders"("encounter_id");

-- CreateIndex
CREATE INDEX "lab_orders_patient_id_ordered_at_idx" ON "lab_orders"("patient_id", "ordered_at");

-- CreateIndex
-- The worklist's one read (P18-T03): everything in a bucket, newest last.
CREATE INDEX "lab_orders_status_ordered_at_idx" ON "lab_orders"("status", "ordered_at");

-- CreateIndex
-- One row per test per order: ordering the same test twice on one request is a
-- mistake, not a quantity.
CREATE UNIQUE INDEX "lab_order_items_lab_order_id_lab_test_id_key" ON "lab_order_items"("lab_order_id", "lab_test_id");

-- CreateIndex
CREATE INDEX "lab_order_items_lab_test_id_idx" ON "lab_order_items"("lab_test_id");

-- CreateIndex
CREATE INDEX "lab_order_items_panel_id_idx" ON "lab_order_items"("panel_id");

-- CreateIndex
CREATE INDEX "lab_order_items_specimen_id_idx" ON "lab_order_items"("specimen_id");

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_ordered_by_id_fkey" FOREIGN KEY ("ordered_by_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Items live and die with their order.
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT, not SET NULL: a catalog row that has been ordered is deactivated,
-- never deleted, and an item that lost its test is an item nobody can price or
-- report.
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_lab_test_id_fkey" FOREIGN KEY ("lab_test_id") REFERENCES "lab_tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "lab_panels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
