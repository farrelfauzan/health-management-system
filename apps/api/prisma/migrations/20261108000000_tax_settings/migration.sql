-- P27-T02 (SJ-243): who the clinic is as a taxpayer. Decision D-038 in
-- docs/post-mvp/decisions.md; research in docs/product/prd-clinic-taxes.md.

-- AlterEnum
-- Named rather than UPDATE: every later tax computation reads this row, so a
-- change to it is its own event in the log.
ALTER TYPE "AuditAction" ADD VALUE 'TAX_SETTINGS_UPDATED';

-- CreateEnum
CREATE TYPE "taxpayer_type" AS ENUM ('INDIVIDUAL', 'PT_PERORANGAN', 'PT', 'CV', 'KOPERASI', 'YAYASAN');

-- CreateEnum
CREATE TYPE "income_tax_regime" AS ENUM ('PP55_FINAL', 'GENERAL');

-- CreateTable
-- Modelled on laboratory_settings: one row, an actor and a timestamp, and no
-- row at all reads as the defaults (general regime, not PKP, tax-inclusive
-- prices). The NPWP stays on clinic_profiles, which owns it.
CREATE TABLE "tax_settings" (
    "id" UUID NOT NULL,
    "facility_id" UUID,
    "taxpayer_type" "taxpayer_type",
    "income_tax_regime" "income_tax_regime" NOT NULL DEFAULT 'GENERAL',
    "pp55_start_year" INTEGER,
    "is_pkp" BOOLEAN NOT NULL DEFAULT false,
    "pkp_since" DATE,
    "nitku" VARCHAR(22),
    "prices_include_tax" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_settings_pkey" PRIMARY KEY ("id")
);

-- A PKP has a registration date and a non-PKP has none: a date with the flag
-- off would be read by a later report as a registration that never happened.
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_pkp_since_check" CHECK (
    "is_pkp" = ("pkp_since" IS NOT NULL)
);

-- The start year only means something on the 0.5% regime; PP 23/2018 opened it.
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_pp55_start_year_check" CHECK (
    ("pp55_start_year" IS NULL)
    OR ("income_tax_regime" = 'PP55_FINAL' AND "pp55_start_year" BETWEEN 2018 AND 2100)
);

-- Digits only, exactly 22; the service also checks the first 16 are the NPWP.
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_nitku_format_check" CHECK (
    ("nitku" IS NULL) OR ("nitku" ~ '^[0-9]{22}$')
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_settings_facility_id_key" ON "tax_settings"("facility_id");

-- CreateIndex
-- PostgreSQL treats NULLs as distinct in a unique index, so the constraint
-- above does not make the single-tenant row a singleton. This one does.
CREATE UNIQUE INDEX "tax_settings_default_singleton_key" ON "tax_settings" (("facility_id" IS NULL)) WHERE "facility_id" IS NULL;

-- AddForeignKey
-- SET NULL: the setting outlives the account that last changed it.
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
