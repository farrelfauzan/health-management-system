-- P18-T03 (SJ-143): the drawn sample, and the link from an order item to the
-- tube that serves it.
--
-- Without this row a result cannot be traced to a draw, a rejected tube cannot
-- be recollected cleanly, and the SATUSEHAT Specimen (P18-T09) has nothing to
-- report.

-- CreateTable
-- Accession numbers are allocated exactly as order and invoice numbers are,
-- and for the same reason: two analysts collecting at once must never print
-- the same barcode.
CREATE TABLE "lab_specimen_counters" (
    "collection_date" DATE NOT NULL,
    "next_value" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_specimen_counters_pkey" PRIMARY KEY ("collection_date")
);

-- CreateTable
CREATE TABLE "lab_specimens" (
    "id" UUID NOT NULL,
    "lab_order_id" UUID NOT NULL,
    "specimen_type" "lab_specimen_type" NOT NULL,
    -- The barcode value, unique clinic-wide rather than per order: it is
    -- scanned at the bench with no order in hand.
    "accession_number" TEXT NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "collected_by_id" UUID NOT NULL,
    "received_at" TIMESTAMP(3),
    "status" "lab_specimen_status" NOT NULL DEFAULT 'COLLECTED',
    "rejected_at" TIMESTAMP(3),
    "reject_reason" "lab_specimen_reject_reason",
    "reject_notes" TEXT,
    "notes" TEXT,
    "satusehat_specimen_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_specimens_pkey" PRIMARY KEY ("id")
);

-- A rejection with no reason is the state this table must never hold: a
-- recollect the patient is asked to sit through has to say why.
ALTER TABLE "lab_specimens" ADD CONSTRAINT "lab_specimens_reject_reason_check" CHECK (
    ("status" <> 'REJECTED') OR ("rejected_at" IS NOT NULL AND "reject_reason" IS NOT NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "lab_specimens_accession_number_key" ON "lab_specimens"("accession_number");

-- CreateIndex
CREATE INDEX "lab_specimens_lab_order_id_idx" ON "lab_specimens"("lab_order_id");

-- CreateIndex
CREATE INDEX "lab_specimens_status_collected_at_idx" ON "lab_specimens"("status", "collected_at");

-- AddForeignKey
-- Specimens live and die with their order, as items do.
ALTER TABLE "lab_specimens" ADD CONSTRAINT "lab_specimens_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT: who drew the tube is part of the chain of custody, so the account
-- that did it cannot be deleted out from under it.
ALTER TABLE "lab_specimens" ADD CONSTRAINT "lab_specimens_collected_by_id_fkey" FOREIGN KEY ("collected_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL, unlike every other reference here: a rejected specimen releases
-- its items back to PENDING, and the row is deleted only if the whole order
-- is. An item waiting for a fresh draw genuinely has no tube.
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "lab_specimens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
