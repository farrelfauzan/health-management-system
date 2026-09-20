-- P24-T10 (SJ-219): a baby born at the clinic is registered from her mother's
-- record. See docs/product/prd-satusehat-klinik-bidan.md FR-NB-01 / FR-NB-02.

-- AlterTable
ALTER TABLE "patient_profiles"
  ADD COLUMN "mother_patient_id" UUID,
  ADD COLUMN "birth_order" INTEGER;

-- A newborn is exactly a row that names a mother, and such a row always says
-- which of her children it is. Counting from 1, as a KIA book does.
ALTER TABLE "patient_profiles"
  ADD CONSTRAINT "patient_profiles_birth_order_check"
  CHECK (
    "mother_patient_id" IS NULL
    OR ("birth_order" IS NOT NULL AND "birth_order" >= 1)
  );

-- AddForeignKey
-- Restrict: a mother with a child in the registry is not a record anyone may
-- remove, and a dangling birth order would say nothing at all.
ALTER TABLE "patient_profiles"
  ADD CONSTRAINT "patient_profiles_mother_patient_id_fkey"
  FOREIGN KEY ("mother_patient_id") REFERENCES "patient_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "patient_profiles_mother_patient_id_idx"
  ON "patient_profiles"("mother_patient_id");

-- Partial unique: twins are birth orders 1 and 2, and registering the same
-- twin twice is the mistake this stops. Partial because the pair is only
-- meaningful for a newborn — every other row has two nulls.
CREATE UNIQUE INDEX "patient_profiles_mother_birth_order_key"
  ON "patient_profiles"("mother_patient_id", "birth_order")
  WHERE "mother_patient_id" IS NOT NULL AND "deleted_at" IS NULL;
