-- P27-T03 (SJ-244): tax codes with effective-dated rates, a default per
-- tariff category and one for medications, and an optional override on each
-- tariff and medication. Decision D-038 in docs/post-mvp/decisions.md.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'TAX_CODE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'TAX_ASSIGNMENT_CHANGED';

-- CreateEnum
CREATE TYPE "ppn_treatment" AS ENUM ('EXEMPT_MEDICAL', 'STANDARD', 'EXEMPT_OTHER', 'NOT_OBJECT');

-- CreateEnum
CREATE TYPE "tax_default_target" AS ENUM ('CONSULTATION', 'PROCEDURE', 'ACCOMMODATION', 'LAB', 'OTHER', 'MEDICATION');

-- CreateTable
CREATE TABLE "tax_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "ppn_treatment" "ppn_treatment" NOT NULL,
    "faktur_transaction_code" VARCHAR(2),
    "invoice_note" VARCHAR(200),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_codes_pkey" PRIMARY KEY ("id")
);

-- The faktur code follows the treatment: an exempt supply is reported under
-- 08, a taxed one under 01 or 04 (DPP nilai lain), and something outside PPN
-- under none. The same table lives in @hms/shared-types
-- (ALLOWED_FAKTUR_CODES_BY_TREATMENT); this is the floor under it.
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_faktur_code_check" CHECK (
    ("ppn_treatment" IN ('EXEMPT_MEDICAL', 'EXEMPT_OTHER') AND "faktur_transaction_code" = '08')
    OR ("ppn_treatment" = 'STANDARD' AND "faktur_transaction_code" IN ('01', '04'))
    OR ("ppn_treatment" = 'NOT_OBJECT' AND "faktur_transaction_code" IS NULL)
);

-- CreateTable
-- Append-only history: a PMK changing the rate is a new row from its date, so
-- an invoice issued under the old rate can always be recomputed with it.
CREATE TABLE "tax_code_rates" (
    "id" UUID NOT NULL,
    "tax_code_id" UUID NOT NULL,
    "rate_percent" DECIMAL(5,2) NOT NULL,
    "dpp_numerator" INTEGER NOT NULL,
    "dpp_denominator" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_code_rates_pkey" PRIMARY KEY ("id")
);

-- A percentage, and a DPP fraction of at most one: 11/12 under PMK 131/2024.
ALTER TABLE "tax_code_rates" ADD CONSTRAINT "tax_code_rates_values_check" CHECK (
    "rate_percent" BETWEEN 0 AND 100
    AND "dpp_numerator" > 0
    AND "dpp_denominator" > 0
    AND "dpp_numerator" <= "dpp_denominator"
);

-- CreateTable
CREATE TABLE "tax_category_defaults" (
    "id" UUID NOT NULL,
    "target" "tax_default_target" NOT NULL,
    "tax_code_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_category_defaults_pkey" PRIMARY KEY ("id")
);

-- AlterTable
-- Null follows the category default, which is what every existing row does.
ALTER TABLE "service_tariffs" ADD COLUMN "tax_code_id" UUID;

-- AlterTable
ALTER TABLE "medications" ADD COLUMN "tax_code_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "tax_codes_code_key" ON "tax_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tax_code_rates_tax_code_id_effective_from_key" ON "tax_code_rates"("tax_code_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "tax_category_defaults_target_key" ON "tax_category_defaults"("target");

-- CreateIndex
CREATE INDEX "tax_category_defaults_tax_code_id_idx" ON "tax_category_defaults"("tax_code_id");

-- CreateIndex
CREATE INDEX "service_tariffs_tax_code_id_idx" ON "service_tariffs"("tax_code_id");

-- CreateIndex
CREATE INDEX "medications_tax_code_id_idx" ON "medications"("tax_code_id");

-- AddForeignKey
-- RESTRICT everywhere a code is referenced: a code in use is deactivated,
-- never deleted, exactly like a tariff.
ALTER TABLE "tax_code_rates" ADD CONSTRAINT "tax_code_rates_tax_code_id_fkey" FOREIGN KEY ("tax_code_id") REFERENCES "tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_code_rates" ADD CONSTRAINT "tax_code_rates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_category_defaults" ADD CONSTRAINT "tax_category_defaults_tax_code_id_fkey" FOREIGN KEY ("tax_code_id") REFERENCES "tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_category_defaults" ADD CONSTRAINT "tax_category_defaults_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tariffs" ADD CONSTRAINT "service_tariffs_tax_code_id_fkey" FOREIGN KEY ("tax_code_id") REFERENCES "tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_tax_code_id_fkey" FOREIGN KEY ("tax_code_id") REFERENCES "tax_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
