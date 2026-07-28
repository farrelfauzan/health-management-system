-- AlterTable
ALTER TABLE "encounters" ADD COLUMN     "assessment" TEXT,
ADD COLUMN     "objective" TEXT,
ADD COLUMN     "plan" TEXT,
ADD COLUMN     "subjective" TEXT;

-- CreateTable
CREATE TABLE "icd9cm_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "display_indonesian" TEXT,
    "category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "icd9cm_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedures" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "icd9cm_code_id" UUID,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "notes" TEXT,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "icd9cm_codes_code_key" ON "icd9cm_codes"("code");

-- CreateIndex
CREATE INDEX "icd9cm_codes_category_idx" ON "icd9cm_codes"("category");

-- CreateIndex
CREATE INDEX "icd9cm_codes_is_active_idx" ON "icd9cm_codes"("is_active");

-- CreateIndex
CREATE INDEX "icd9cm_codes_deleted_at_idx" ON "icd9cm_codes"("deleted_at");

-- CreateIndex
CREATE INDEX "procedures_encounter_id_performed_at_idx" ON "procedures"("encounter_id", "performed_at");

-- CreateIndex
CREATE INDEX "procedures_code_idx" ON "procedures"("code");

-- CreateIndex
CREATE INDEX "procedures_deleted_at_idx" ON "procedures"("deleted_at");

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_icd9cm_code_id_fkey" FOREIGN KEY ("icd9cm_code_id") REFERENCES "icd9cm_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Partial unique index, hand-written because Prisma cannot put a WHERE clause
-- on an index. Mirrors `diagnoses_encounter_id_code_key`: the same procedure
-- code is not recorded twice on one encounter, and the `deleted_at IS NULL`
-- scope keeps a soft-deleted row from blocking a correction. Quantity — two of
-- the same injection — belongs on the claim line, not in duplicate rows.
CREATE UNIQUE INDEX "procedures_encounter_id_code_key" ON "procedures" ("encounter_id", "code") WHERE "deleted_at" IS NULL;
