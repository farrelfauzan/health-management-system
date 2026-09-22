-- P27-T07 (SJ-248): PPh 21 bukan pegawai on clinician fees. A third monthly
-- draft kind — one BP21 per clinician per month — and the Pasal 17(1)(a)
-- brackets it is taxed under, stored as effective-dated rows rather than
-- constants (D-038: tax is data). The bracket rows themselves are seeded, not
-- migrated, so a clinic can add a set when the law changes.

-- AlterEnum
ALTER TYPE "tax_report_kind" ADD VALUE 'PPH21_NON_EMPLOYEE';

-- CreateTable
CREATE TABLE "pph21_tax_brackets" (
    "id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "lower_bound" DECIMAL(15,2) NOT NULL,
    "upper_bound" DECIMAL(15,2),
    "rate_percent" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pph21_tax_brackets_pkey" PRIMARY KEY ("id")
);

-- A bracket runs from its lower bound up to (excluding) its upper bound, or
-- open-ended; a rate is a percentage.
ALTER TABLE "pph21_tax_brackets" ADD CONSTRAINT "pph21_tax_brackets_bounds_check" CHECK (
    "lower_bound" >= 0 AND ("upper_bound" IS NULL OR "upper_bound" > "lower_bound")
);

ALTER TABLE "pph21_tax_brackets" ADD CONSTRAINT "pph21_tax_brackets_rate_check" CHECK (
    "rate_percent" >= 0 AND "rate_percent" <= 100
);

-- CreateIndex
-- One bracket per lower bound per set: two rows starting at the same rupiah
-- on the same date would be two rates for one slice.
CREATE UNIQUE INDEX "pph21_tax_brackets_effective_from_lower_bound_key" ON "pph21_tax_brackets"("effective_from", "lower_bound");
