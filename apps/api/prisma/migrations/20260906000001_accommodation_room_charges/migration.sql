-- IMP-15, part 2 of 2: accommodation tariffs, and invoices that bill a stay.
--
-- Two facts the billing schema could not express before. A tariff had no way
-- to say *which ward class* it prices, and an invoice had no way to belong to
-- anything but an encounter -- so an inpatient admitted directly, with no
-- outpatient consultation to refer them in, could never be billed at all.
--
-- The class is a foreign key into `room_classes` (IMP-11), not an enum value:
-- a clinic that adds a "Suite" from the master-data screen prices it the same
-- afternoon, with no migration and no release.
--
-- `invoices.encounter_id` therefore becomes nullable and gains an
-- `admission_id` sibling, with a CHECK that exactly one of them is set: an
-- invoice always names the episode of care it bills, and never two.

-- AlterTable
ALTER TABLE "service_tariffs" ADD COLUMN "room_class_id" UUID;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "admission_id" UUID,
ALTER COLUMN "encounter_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "service_tariffs_room_class_id_idx" ON "service_tariffs"("room_class_id");

-- CreateIndex
CREATE INDEX "invoices_admission_id_idx" ON "invoices"("admission_id");

-- AddForeignKey
ALTER TABLE "service_tariffs" ADD CONSTRAINT "service_tariffs_room_class_id_fkey" FOREIGN KEY ("room_class_id") REFERENCES "room_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "admissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- `room_class_id` is required for ACCOMMODATION rows and forbidden everywhere
-- else. Without the second half, a consultation fee could carry a ward class
-- that nothing reads -- a field that means something on one row and nothing on
-- the next is how the two start disagreeing.
ALTER TABLE "service_tariffs"
  ADD CONSTRAINT "service_tariffs_room_class_category_check"
  CHECK (
    ("category" = 'ACCOMMODATION' AND "room_class_id" IS NOT NULL)
    OR ("category" <> 'ACCOMMODATION' AND "room_class_id" IS NULL)
  );

-- One live accommodation tariff per ward class: a bed cannot have two prices
-- at once, and a night billed at the wrong one of two is not a rounding error.
-- Retiring a tariff frees its class for the replacement, exactly as
-- `wards_code_live_key` frees a ward code.
CREATE UNIQUE INDEX "service_tariffs_room_class_id_live_key"
  ON "service_tariffs" ("room_class_id")
  WHERE "category" = 'ACCOMMODATION' AND "deleted_at" IS NULL;

-- An invoice bills exactly one episode of care.
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_one_episode_check"
  CHECK (("encounter_id" IS NULL) <> ("admission_id" IS NULL));

-- The `invoices_encounter_id_live_key` rule, restated for stays: at most one
-- live invoice per admission, with voided ones free to accumulate.
CREATE UNIQUE INDEX "invoices_admission_id_live_key"
  ON "invoices" ("admission_id")
  WHERE "status" <> 'VOID' AND "deleted_at" IS NULL;
