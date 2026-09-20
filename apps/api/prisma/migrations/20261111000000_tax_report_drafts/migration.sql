-- P27-T05 (SJ-246): monthly tax report drafts — PP 55 omzet and PPN keluaran —
-- the clinic pays and files from in Coretax (D-038: the product drafts, never
-- files).

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'TAX_REPORT_FINALIZED';

-- CreateEnum
CREATE TYPE "tax_report_kind" AS ENUM ('PP55_OMZET', 'PPN_OUTPUT');

-- CreateEnum
CREATE TYPE "tax_report_status" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateTable
CREATE TABLE "tax_report_drafts" (
    "id" UUID NOT NULL,
    "period" CHAR(7) NOT NULL,
    "kind" "tax_report_kind" NOT NULL,
    "status" "tax_report_status" NOT NULL DEFAULT 'DRAFT',
    "summary" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "generated_by_id" UUID,
    "finalized_at" TIMESTAMP(3),
    "finalized_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_report_drafts_pkey" PRIMARY KEY ("id")
);

-- A month is YYYY-MM; a finalized report names when it was frozen, and a
-- draft does not.
ALTER TABLE "tax_report_drafts" ADD CONSTRAINT "tax_report_drafts_period_check" CHECK (
    "period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
);

ALTER TABLE "tax_report_drafts" ADD CONSTRAINT "tax_report_drafts_finalized_check" CHECK (
    ("status" = 'FINALIZED') = ("finalized_at" IS NOT NULL)
);

-- CreateIndex
-- One report per month and kind: a second draft of the same month would be
-- two answers to one question.
CREATE UNIQUE INDEX "tax_report_drafts_period_kind_key" ON "tax_report_drafts"("period", "kind");

-- AddForeignKey
ALTER TABLE "tax_report_drafts" ADD CONSTRAINT "tax_report_drafts_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_report_drafts" ADD CONSTRAINT "tax_report_drafts_finalized_by_id_fkey" FOREIGN KEY ("finalized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
