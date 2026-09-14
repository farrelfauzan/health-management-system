-- P24-T04 (FR-MW-06). Which catalog items a midwife may prescribe. Defaults to
-- false and the seed sets none: which items fall inside a bidan's authority is
-- the clinic's decision, not ours.
ALTER TABLE "medications" ADD COLUMN "is_midwife_prescribable" BOOLEAN NOT NULL DEFAULT false;
