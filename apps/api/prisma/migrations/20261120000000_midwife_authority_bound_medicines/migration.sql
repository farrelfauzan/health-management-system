-- P25-T05: which medicines a bidan may write only under a doctor's authority.
--
-- `is_midwife_prescribable` already says whether an item is inside her
-- formulary at all. This says, for an item that is, which authority it sits
-- under: null means her own (Permenkes 28/2017 Pasal 18–21, kept as the
-- reference by Permenkes 13/2025 Pasal 305(1)), and a kind means she needs
-- either that authority or a live pelimpahan naming it (PP 28/2024 Pasal 744).
ALTER TABLE "medications"
  ADD COLUMN "midwife_authority_kind" "doctor_authority_kind";

ALTER TABLE "midwife_formulary_items"
  ADD COLUMN "authority_kind" "doctor_authority_kind";

-- The template row's group and its kind are one statement, not two: an
-- AUTHORITY_BOUND row with no kind names no gate to apply, and a kind on an
-- OWN_AUTHORITY row claims a gate that is never asked for.
ALTER TABLE "midwife_formulary_items"
  ADD CONSTRAINT "midwife_formulary_items_authority_kind_matches_group"
  CHECK (("group" = 'AUTHORITY_BOUND') = ("authority_kind" IS NOT NULL));

-- Read on every midwife prescription, so the flagged rows are worth their own
-- partial index: the catalogue is mostly unflagged.
CREATE INDEX "medications_midwife_authority_kind_idx"
  ON "medications" ("midwife_authority_kind")
  WHERE "midwife_authority_kind" IS NOT NULL;
