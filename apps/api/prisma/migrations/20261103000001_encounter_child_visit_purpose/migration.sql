-- P25-T03, part B: the two nullable columns. Nullable because every existing
-- encounter and procedure predates the rule, and because the purpose is only
-- recorded for a midwife's under-five visit.

-- AlterTable
ALTER TABLE "encounters" ADD COLUMN "child_visit_purpose" "encounter_child_visit_purpose";

-- AlterTable
ALTER TABLE "procedures" ADD COLUMN "contraceptive_implant_action" "contraceptive_implant_action";
