-- AlterTable
ALTER TABLE "documents" ADD COLUMN "patient_id" UUID,
ADD COLUMN "encounter_id" UUID,
ADD COLUMN "admission_id" UUID,
ADD COLUMN "category" "DocumentCategory",
ADD COLUMN "document_date" DATE,
ADD COLUMN "notes" TEXT,
ADD COLUMN "released_to_patient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "released_at" TIMESTAMP(3),
ADD COLUMN "released_by_id" UUID,
ADD COLUMN "delete_reason" TEXT;

-- CreateIndex
CREATE INDEX "documents_patient_id_document_date_idx" ON "documents"("patient_id", "document_date");

-- CreateIndex
CREATE INDEX "documents_encounter_id_idx" ON "documents"("encounter_id");

-- CreateIndex
CREATE INDEX "documents_admission_id_idx" ON "documents"("admission_id");

-- CreateIndex
CREATE INDEX "documents_purpose_category_idx" ON "documents"("purpose", "category");

-- CreateIndex
CREATE INDEX "documents_released_by_id_idx" ON "documents"("released_by_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "admissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written CHECKs. Purpose, owner type, and the patient pointer are one
-- fact stated three ways, and letting any pair drift apart produces a row the
-- access rules cannot classify: a "clinical" file with no patient is
-- unfindable from the chart, and a PATIENT-owned row with a corpus purpose
-- would sit in the chatbot's ingestion path. All existing rows satisfy these
-- trivially — no row carries the new purpose, owner type, or columns yet.
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_patient_clinical_owner_check"
  CHECK (
    (("purpose" = 'PATIENT_CLINICAL') = ("owner_type" = 'PATIENT'))
    AND (("purpose" = 'PATIENT_CLINICAL') = ("patient_id" IS NOT NULL))
  );

-- A clinical file belongs to a visit or to a stay, never both — the Invoice
-- episode rule applied to paperwork.
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_one_care_episode_check"
  CHECK ("encounter_id" IS NULL OR "admission_id" IS NULL);

-- Care-episode pointers and clinical annotations mean nothing on a corpus
-- document; refusing them here keeps "which purposes use which columns" a
-- database fact rather than a service convention.
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_care_episode_is_clinical_check"
  CHECK (
    ("encounter_id" IS NULL AND "admission_id" IS NULL AND "category" IS NULL)
    OR "purpose" = 'PATIENT_CLINICAL'
  );
