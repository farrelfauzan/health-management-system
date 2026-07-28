-- CreateEnum
CREATE TYPE "ServiceTariffCategory" AS ENUM ('CONSULTATION', 'PROCEDURE', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "InvoiceItemType" AS ENUM ('CONSULTATION', 'PROCEDURE', 'MEDICATION', 'OTHER');

-- AlterTable
ALTER TABLE "medications" ADD COLUMN     "unit_price" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "service_tariffs" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ServiceTariffCategory" NOT NULL,
    "icd9cm_code" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "service_tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counters" (
    "invoice_date" DATE NOT NULL,
    "next_value" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("invoice_date")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "encounter_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "voided_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "item_type" "InvoiceItemType" NOT NULL,
    "service_tariff_id" UUID,
    "medication_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_tariffs_code_key" ON "service_tariffs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "service_tariffs_icd9cm_code_key" ON "service_tariffs"("icd9cm_code");

-- CreateIndex
CREATE INDEX "service_tariffs_category_idx" ON "service_tariffs"("category");

-- CreateIndex
CREATE INDEX "service_tariffs_is_active_idx" ON "service_tariffs"("is_active");

-- CreateIndex
CREATE INDEX "service_tariffs_deleted_at_idx" ON "service_tariffs"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_encounter_id_idx" ON "invoices"("encounter_id");

-- CreateIndex
CREATE INDEX "invoices_patient_id_created_at_idx" ON "invoices"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "invoices_status_issued_at_idx" ON "invoices"("status", "issued_at");

-- CreateIndex
CREATE INDEX "invoices_deleted_at_idx" ON "invoices"("deleted_at");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_items_service_tariff_id_idx" ON "invoice_items"("service_tariff_id");

-- CreateIndex
CREATE INDEX "invoice_items_medication_id_idx" ON "invoice_items"("medication_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_service_tariff_id_fkey" FOREIGN KEY ("service_tariff_id") REFERENCES "service_tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_medication_id_fkey" FOREIGN KEY ("medication_id") REFERENCES "medications"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written constraints below. Prisma cannot express partial unique
-- indexes or CHECK constraints, and `migrate diff` ignores both, so CI's
-- drift gate stays green (same approach as the diagnosis/vital-signs
-- migrations).

-- At most one live invoice per encounter: a wrongly issued invoice is voided
-- (never deleted) and a corrected replacement issued for the same encounter,
-- so uniqueness must exclude VOID rows the way the diagnosis PRIMARY index
-- excludes soft-deleted rows.
CREATE UNIQUE INDEX "invoices_encounter_id_live_key" ON "invoices" ("encounter_id") WHERE "status" <> 'VOID' AND "deleted_at" IS NULL;

-- Money sanity: negative prices and non-positive quantities are data errors,
-- and an item's amount is by definition its quantity times its unit price —
-- storing a contradicting total would falsify the financial snapshot.
ALTER TABLE "service_tariffs" ADD CONSTRAINT "service_tariffs_price_check" CHECK ("price" >= 0);
ALTER TABLE "medications" ADD CONSTRAINT "medications_unit_price_check" CHECK ("unit_price" IS NULL OR "unit_price" >= 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_total_amount_check" CHECK ("total_amount" >= 0);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_unit_price_check" CHECK ("unit_price" >= 0);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_amount_check" CHECK ("amount" = "quantity" * "unit_price");
