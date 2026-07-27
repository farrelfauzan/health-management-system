-- CreateEnum
CREATE TYPE "MedicationUnit" AS ENUM (
    'TABLET',
    'KAPSUL',
    'KAPLET',
    'SACHET',
    'AMPUL',
    'VIAL',
    'BOTOL',
    'TUBE',
    'STRIP',
    'BOX',
    'PCS',
    'ML',
    'MG',
    'GRAM',
    'MCG',
    'IU',
    'TETES',
    'SUPOSITORIA'
);

-- CreateEnum
CREATE TYPE "MedicationCategory" AS ENUM (
    'OBAT_BEBAS',
    'OBAT_BEBAS_TERBATAS',
    'OBAT_KERAS',
    'PSIKOTROPIKA',
    'NARKOTIKA',
    'OBAT_HERBAL',
    'SUPLEMEN',
    'ALAT_KESEHATAN'
);

-- AlterTable
ALTER TABLE "medications" ADD COLUMN "kfa_code" TEXT;
ALTER TABLE "medications" ADD COLUMN "category" "MedicationCategory";

-- Convert the free-text "unit" column to the MedicationUnit enum. Existing rows
-- are mapped through the synonyms clinics actually typed; anything unmappable
-- aborts the migration rather than silently discarding catalog data.
DO $$
DECLARE
  unmapped_units TEXT;
BEGIN
  SELECT string_agg(DISTINCT "unit", ', ')
  INTO unmapped_units
  FROM "medications"
  WHERE "unit" IS NOT NULL
    AND upper(btrim("unit")) NOT IN (
      'TABLET', 'TAB', 'TABLETS',
      'KAPSUL', 'CAPSULE', 'CAPSULES', 'KAPS', 'CAP',
      'KAPLET', 'CAPLET',
      'SACHET', 'SASET',
      'AMPUL', 'AMPOULE', 'AMP',
      'VIAL',
      'BOTOL', 'BOTTLE',
      'TUBE',
      'STRIP',
      'BOX', 'DUS',
      'PCS', 'PIECE', 'PIECES', 'BUAH',
      'ML', 'MILLILITER', 'MILILITER',
      'MG', 'MILIGRAM', 'MILLIGRAM',
      'GRAM', 'G', 'GR',
      'MCG', 'UG', 'MIKROGRAM', 'MICROGRAM',
      'IU', 'UI',
      'TETES', 'DROP', 'DROPS',
      'SUPOSITORIA', 'SUPPOSITORIA', 'SUPPOSITORY'
    );

  IF unmapped_units IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot map medication unit values to MedicationUnit: %', unmapped_units;
  END IF;
END
$$;

ALTER TABLE "medications"
  ALTER COLUMN "unit" TYPE "MedicationUnit"
  USING (
    CASE upper(btrim("unit"))
      WHEN 'TABLET' THEN 'TABLET'
      WHEN 'TAB' THEN 'TABLET'
      WHEN 'TABLETS' THEN 'TABLET'
      WHEN 'KAPSUL' THEN 'KAPSUL'
      WHEN 'CAPSULE' THEN 'KAPSUL'
      WHEN 'CAPSULES' THEN 'KAPSUL'
      WHEN 'KAPS' THEN 'KAPSUL'
      WHEN 'CAP' THEN 'KAPSUL'
      WHEN 'KAPLET' THEN 'KAPLET'
      WHEN 'CAPLET' THEN 'KAPLET'
      WHEN 'SACHET' THEN 'SACHET'
      WHEN 'SASET' THEN 'SACHET'
      WHEN 'AMPUL' THEN 'AMPUL'
      WHEN 'AMPOULE' THEN 'AMPUL'
      WHEN 'AMP' THEN 'AMPUL'
      WHEN 'VIAL' THEN 'VIAL'
      WHEN 'BOTOL' THEN 'BOTOL'
      WHEN 'BOTTLE' THEN 'BOTOL'
      WHEN 'TUBE' THEN 'TUBE'
      WHEN 'STRIP' THEN 'STRIP'
      WHEN 'BOX' THEN 'BOX'
      WHEN 'DUS' THEN 'BOX'
      WHEN 'PCS' THEN 'PCS'
      WHEN 'PIECE' THEN 'PCS'
      WHEN 'PIECES' THEN 'PCS'
      WHEN 'BUAH' THEN 'PCS'
      WHEN 'ML' THEN 'ML'
      WHEN 'MILLILITER' THEN 'ML'
      WHEN 'MILILITER' THEN 'ML'
      WHEN 'MG' THEN 'MG'
      WHEN 'MILIGRAM' THEN 'MG'
      WHEN 'MILLIGRAM' THEN 'MG'
      WHEN 'GRAM' THEN 'GRAM'
      WHEN 'G' THEN 'GRAM'
      WHEN 'GR' THEN 'GRAM'
      WHEN 'MCG' THEN 'MCG'
      WHEN 'UG' THEN 'MCG'
      WHEN 'MIKROGRAM' THEN 'MCG'
      WHEN 'MICROGRAM' THEN 'MCG'
      WHEN 'IU' THEN 'IU'
      WHEN 'UI' THEN 'IU'
      WHEN 'TETES' THEN 'TETES'
      WHEN 'DROP' THEN 'TETES'
      WHEN 'DROPS' THEN 'TETES'
      WHEN 'SUPOSITORIA' THEN 'SUPOSITORIA'
      WHEN 'SUPPOSITORIA' THEN 'SUPOSITORIA'
      WHEN 'SUPPOSITORY' THEN 'SUPOSITORIA'
      ELSE NULL
    END
  )::"MedicationUnit";

-- CreateIndex
CREATE UNIQUE INDEX "medications_kfa_code_key" ON "medications"("kfa_code");

-- CreateIndex
CREATE INDEX "medications_category_idx" ON "medications"("category");
