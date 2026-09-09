-- P19-T14. Master data for the credentials that print alongside a doctor's
-- name: titles ("dr."), degrees ("Sp.PD") and education fields of study. All
-- three were free text on the doctor form, so the same credential reached
-- documents spelled five different ways.
--
-- One table for all three kinds: they share every column, every screen and
-- every rule, and only the list a field draws from differs.
--
-- Nothing here touches doctor_profiles.title/degrees or
-- doctor_educations.field_of_study. Those columns stay TEXT and now hold option
-- codes going forward; rows written before this migration keep their free text
-- and are resolved by label on read, because guessing a code for every legacy
-- spelling in SQL would silently rewrite credentials nobody can re-derive.

-- CreateEnum
CREATE TYPE "doctor_credential_kind" AS ENUM ('TITLE', 'DEGREE', 'FIELD_OF_STUDY');

-- CreateTable
CREATE TABLE "doctor_credential_options" (
    "id" UUID NOT NULL,
    "kind" "doctor_credential_kind" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "doctor_credential_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_credential_options_kind_is_active_idx" ON "doctor_credential_options"("kind", "is_active");

-- CreateIndex
CREATE INDEX "doctor_credential_options_deleted_at_idx" ON "doctor_credential_options"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_credential_options_kind_code_key" ON "doctor_credential_options"("kind", "code");
