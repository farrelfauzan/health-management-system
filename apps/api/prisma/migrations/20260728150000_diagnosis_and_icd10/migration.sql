-- CreateEnum
CREATE TYPE "DiagnosisType" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateTable
CREATE TABLE "icd10_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "display_indonesian" TEXT,
    "category" TEXT,
    "chapter" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "icd10_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnoses" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "icd10_code_id" UUID,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "type" "DiagnosisType" NOT NULL DEFAULT 'SECONDARY',
    "notes" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "icd10_codes_code_key" ON "icd10_codes"("code");

-- CreateIndex
CREATE INDEX "icd10_codes_category_idx" ON "icd10_codes"("category");

-- CreateIndex
CREATE INDEX "icd10_codes_is_active_idx" ON "icd10_codes"("is_active");

-- CreateIndex
CREATE INDEX "icd10_codes_deleted_at_idx" ON "icd10_codes"("deleted_at");

-- CreateIndex
CREATE INDEX "diagnoses_encounter_id_type_idx" ON "diagnoses"("encounter_id", "type");

-- CreateIndex
CREATE INDEX "diagnoses_code_idx" ON "diagnoses"("code");

-- CreateIndex
CREATE INDEX "diagnoses_deleted_at_idx" ON "diagnoses"("deleted_at");

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_icd10_code_id_fkey" FOREIGN KEY ("icd10_code_id") REFERENCES "icd10_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Partial unique indexes. Prisma cannot express a `WHERE` clause on an index,
-- so these are written by hand; `prisma migrate diff` ignores them and reports
-- no drift. Both are scoped to `deleted_at IS NULL` — a plain unique constraint
-- would let a soft-deleted row block re-recording a corrected diagnosis.

-- Exactly one primary diagnosis per encounter. BPJS claims and SATUSEHAT
-- Condition submissions both single out "the" primary, so a second one is not a
-- clinical judgement call, it is a data error.
CREATE UNIQUE INDEX "diagnoses_encounter_id_primary_key" ON "diagnoses" ("encounter_id") WHERE "type" = 'PRIMARY' AND "deleted_at" IS NULL;

-- The same ICD-10 code cannot be recorded twice on one encounter.
CREATE UNIQUE INDEX "diagnoses_encounter_id_code_key" ON "diagnoses" ("encounter_id", "code") WHERE "deleted_at" IS NULL;
