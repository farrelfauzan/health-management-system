-- P27-T04 (SJ-245): the PPN inside each invoice line and invoice. Prices are
-- always tax-inclusive (D-038, product decision 2026-09-19), so neither column
-- ever adds to a total; they say how much of it is PPN. Existing rows start at
-- zero with no tax code — billed before the tax module, and reported as such.

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN "tax_code" VARCHAR(40),
ADD COLUMN "ppn_treatment" "ppn_treatment",
ADD COLUMN "faktur_transaction_code" VARCHAR(2),
ADD COLUMN "taxable_amount" DECIMAL(12,2),
ADD COLUMN "tax_base" DECIMAL(12,2),
ADD COLUMN "tax_rate_percent" DECIMAL(5,2),
ADD COLUMN "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- The PPN is part of what the patient pays, never more than it and never
-- negative; the invoice's share is bounded by its total the same way.
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_tax_amount_check" CHECK (
    "tax_amount" >= 0 AND "tax_amount" <= "amount"
);

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_amount_check" CHECK (
    "tax_amount" >= 0 AND "tax_amount" <= "total_amount"
);
