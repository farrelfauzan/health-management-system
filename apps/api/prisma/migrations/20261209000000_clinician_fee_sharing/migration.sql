-- P27-T06 (SJ-247): jasa medis. Fee rules per tariff or tariff category, with
-- an optional clinician, and a signed ledger written when an invoice is paid
-- and reversed when a paid invoice is voided.
-- CreateEnum
CREATE TYPE "ClinicianFeeRuleMode" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "ClinicianFeeEntryKind" AS ENUM ('ACCRUAL', 'REVERSAL');

-- CreateTable
CREATE TABLE "clinician_fee_rules" (
    "id" UUID NOT NULL,
    "service_tariff_id" UUID,
    "category" "ServiceTariffCategory",
    "doctor_id" UUID,
    "mode" "ClinicianFeeRuleMode" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "clinician_fee_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinician_fee_entries" (
    "id" UUID NOT NULL,
    "kind" "ClinicianFeeEntryKind" NOT NULL,
    "invoice_id" UUID NOT NULL,
    "invoice_item_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "rule_id" UUID,
    "rule_mode" "ClinicianFeeRuleMode" NOT NULL,
    "rule_value" DECIMAL(12,2) NOT NULL,
    "line_amount" DECIMAL(12,2) NOT NULL,
    "gross_fee" DECIMAL(12,2) NOT NULL,
    "clinic_share" DECIMAL(12,2) NOT NULL,
    "period" CHAR(7) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinician_fee_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinician_fee_rules_service_tariff_id_idx" ON "clinician_fee_rules"("service_tariff_id");

-- CreateIndex
CREATE INDEX "clinician_fee_rules_category_idx" ON "clinician_fee_rules"("category");

-- CreateIndex
CREATE INDEX "clinician_fee_rules_doctor_id_idx" ON "clinician_fee_rules"("doctor_id");

-- CreateIndex
CREATE INDEX "clinician_fee_rules_deleted_at_idx" ON "clinician_fee_rules"("deleted_at");

-- CreateIndex
CREATE INDEX "clinician_fee_entries_invoice_id_idx" ON "clinician_fee_entries"("invoice_id");

-- CreateIndex
CREATE INDEX "clinician_fee_entries_doctor_id_period_idx" ON "clinician_fee_entries"("doctor_id", "period");

-- CreateIndex
CREATE INDEX "clinician_fee_entries_period_idx" ON "clinician_fee_entries"("period");

-- CreateIndex
CREATE INDEX "clinician_fee_entries_rule_id_idx" ON "clinician_fee_entries"("rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinician_fee_entries_invoice_item_id_kind_key" ON "clinician_fee_entries"("invoice_item_id", "kind");

-- AddForeignKey
ALTER TABLE "clinician_fee_rules" ADD CONSTRAINT "clinician_fee_rules_service_tariff_id_fkey" FOREIGN KEY ("service_tariff_id") REFERENCES "service_tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinician_fee_rules" ADD CONSTRAINT "clinician_fee_rules_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinician_fee_entries" ADD CONSTRAINT "clinician_fee_entries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinician_fee_entries" ADD CONSTRAINT "clinician_fee_entries_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinician_fee_entries" ADD CONSTRAINT "clinician_fee_entries_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinician_fee_entries" ADD CONSTRAINT "clinician_fee_entries_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "clinician_fee_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A rule targets exactly one of a tariff or a tariff category.
ALTER TABLE "clinician_fee_rules" ADD CONSTRAINT "clinician_fee_rules_one_target_check"
  CHECK (("service_tariff_id" IS NULL) <> ("category" IS NULL));

-- A share is never negative, and a percentage never exceeds the whole line.
ALTER TABLE "clinician_fee_rules" ADD CONSTRAINT "clinician_fee_rules_value_check"
  CHECK ("value" >= 0 AND ("mode" <> 'PERCENT' OR "value" <= 100));

-- Both ends inclusive; an end before the start is a typing error.
ALTER TABLE "clinician_fee_rules" ADD CONSTRAINT "clinician_fee_rules_effective_range_check"
  CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");

-- An accrual is positive, a reversal negative, and the two shares always add
-- up to the line: a period total is a plain sum with no sign logic.
ALTER TABLE "clinician_fee_entries" ADD CONSTRAINT "clinician_fee_entries_sign_check"
  CHECK (
    ("kind" = 'ACCRUAL' AND "line_amount" >= 0 AND "gross_fee" >= 0 AND "clinic_share" >= 0)
    OR ("kind" = 'REVERSAL' AND "line_amount" <= 0 AND "gross_fee" <= 0 AND "clinic_share" <= 0)
  );

ALTER TABLE "clinician_fee_entries" ADD CONSTRAINT "clinician_fee_entries_shares_check"
  CHECK ("gross_fee" + "clinic_share" = "line_amount");

ALTER TABLE "clinician_fee_entries" ADD CONSTRAINT "clinician_fee_entries_period_check"
  CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
