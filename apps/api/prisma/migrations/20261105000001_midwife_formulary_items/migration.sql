-- P25-T04 (FR-FORM-01/02). The midwife formulary template: one row per item
-- Permenkes 28/2017 lets a bidan give, matched against the clinic's own
-- catalog when an admin applies it. Reference data that the seed upserts by
-- `code`; nothing here touches `medications.is_midwife_prescribable`, which
-- only the confirmed apply step sets (FR-MW-06).
--
-- `kfa_codes` holds accepted KFA product codes (93-level for farmasi,
-- 83-level for alkes such as condoms), `kfa_template_codes` the generic
-- template codes (92/82-level) those products sit under, so the same drug
-- from another manufacturer still matches, and `match_keywords` name fragments
-- that only suggest a row for the clinic to verify.

-- CreateTable
CREATE TABLE "midwife_formulary_items" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "group" "midwife_formulary_group" NOT NULL,
    "regulation_basis" TEXT NOT NULL,
    "kfa_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "kfa_template_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "match_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "midwife_formulary_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "midwife_formulary_items_code_key" ON "midwife_formulary_items"("code");

-- CreateIndex
CREATE INDEX "midwife_formulary_items_group_sort_order_idx" ON "midwife_formulary_items"("group", "sort_order");
