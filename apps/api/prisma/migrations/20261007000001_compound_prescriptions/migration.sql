-- P10-T18 (SJ-88): compounded prescriptions (racikan) as structured records.
--
-- The catalog holds products, so `Medication` goes to SATUSEHAT as type NC and
-- a compounded prescription — puyer, kapsul campur, sirup racikan — cannot be
-- recorded at all: not dispensed from stock correctly, not priced as what it
-- is, not reportable. Routine in klinik pratama paediatrics.
--
-- The line stays one `prescription_medications` row. A compound is a
-- prescription line like any other from the doctor's, the pharmacist's and the
-- patient's point of view; what changes is that its `medication_id` is null
-- and its ingredients live in a child table. Modelling it as a separate line
-- type would fork every read in the pharmacy flow for no gain.

-- AlterTable
ALTER TABLE "prescription_medications" ALTER COLUMN "medication_id" DROP NOT NULL;
ALTER TABLE "prescription_medications" ADD COLUMN "is_compound" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "prescription_medications" ADD COLUMN "compound_name" TEXT;
ALTER TABLE "prescription_medications" ADD COLUMN "preparation" "compound_preparation";
-- What one unit of the compound is called: "bungkus", "kapsul", "botol".
-- `quantity` on this row is how many of them were prescribed.
ALTER TABLE "prescription_medications" ADD COLUMN "dosage_unit" TEXT;

-- Exactly one of the two shapes, always. Without this a line could carry both
-- a catalog product and a compound name, and every reader downstream would
-- have to decide which one it meant.
ALTER TABLE "prescription_medications" ADD CONSTRAINT "prescription_medications_compound_shape_check" CHECK (
    ("is_compound" AND "medication_id" IS NULL AND "compound_name" IS NOT NULL)
    OR (NOT "is_compound" AND "medication_id" IS NOT NULL AND "compound_name" IS NULL)
);

-- The old unique index forbade two lines for one medication on a prescription.
-- It cannot survive a nullable column as a plain unique: Postgres treats NULLs
-- as distinct, so every compound line would pass it and it would silently stop
-- meaning anything. Replaced by a partial index that says what was always
-- meant — one line per product — and leaves compound lines out of it, since a
-- prescription may legitimately carry two different puyer.
DROP INDEX IF EXISTS "prescription_medications_prescription_id_medication_id_key";
CREATE UNIQUE INDEX "prescription_medications_product_line_key"
    ON "prescription_medications"("prescription_id", "medication_id")
    WHERE "medication_id" IS NOT NULL;

-- CreateTable
CREATE TABLE "prescription_item_components" (
    "id" UUID NOT NULL,
    "prescription_item_id" UUID NOT NULL,
    "medication_id" UUID NOT NULL,
    -- Decimal: a puyer routinely uses a third or a half of a tablet, which is
    -- the whole reason the compound exists.
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescription_item_components_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "prescription_item_components" ADD CONSTRAINT "prescription_item_components_quantity_check" CHECK ("quantity" > 0);

-- CreateIndex
CREATE INDEX "prescription_item_components_prescription_item_id_idx" ON "prescription_item_components"("prescription_item_id");
CREATE INDEX "prescription_item_components_medication_id_idx" ON "prescription_item_components"("medication_id");

-- One row per ingredient. Two rows for the same product on one compound would
-- be an entry error, and the pharmacist would allocate stock twice for it.
CREATE UNIQUE INDEX "prescription_item_components_item_medication_key" ON "prescription_item_components"("prescription_item_id", "medication_id");

-- AddForeignKey
ALTER TABLE "prescription_item_components" ADD CONSTRAINT "prescription_item_components_prescription_item_id_fkey" FOREIGN KEY ("prescription_item_id") REFERENCES "prescription_medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prescription_item_components" ADD CONSTRAINT "prescription_item_components_medication_id_fkey" FOREIGN KEY ("medication_id") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A dispensed compound is one line the patient receives, with stock taken from
-- each ingredient. The line therefore points at the prescription item rather
-- than at a product, and its allocations resolve to component medications
-- through their stock receipts — which is what the existing
-- `dispense_item_stock_allocations` table already records.
ALTER TABLE "dispense_items" ALTER COLUMN "medication_id" DROP NOT NULL;
ALTER TABLE "dispense_items" ADD COLUMN "prescription_item_id" UUID;

ALTER TABLE "dispense_items" ADD CONSTRAINT "dispense_items_subject_check" CHECK (
    ("medication_id" IS NOT NULL AND "prescription_item_id" IS NULL)
    OR ("medication_id" IS NULL AND "prescription_item_id" IS NOT NULL)
);

DROP INDEX IF EXISTS "dispense_items_dispense_record_id_medication_id_key";
CREATE UNIQUE INDEX "dispense_items_product_line_key"
    ON "dispense_items"("dispense_record_id", "medication_id")
    WHERE "medication_id" IS NOT NULL;
CREATE UNIQUE INDEX "dispense_items_compound_line_key"
    ON "dispense_items"("dispense_record_id", "prescription_item_id")
    WHERE "prescription_item_id" IS NOT NULL;

CREATE INDEX "dispense_items_prescription_item_id_idx" ON "dispense_items"("prescription_item_id");

ALTER TABLE "dispense_items" ADD CONSTRAINT "dispense_items_prescription_item_id_fkey" FOREIGN KEY ("prescription_item_id") REFERENCES "prescription_medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
