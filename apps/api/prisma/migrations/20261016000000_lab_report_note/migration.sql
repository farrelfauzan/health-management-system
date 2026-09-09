-- P18-T14 (SJ-154): the verifier's interpretive note on the released report.
--
-- On the report *version*, not the order. A note belongs to the sheet it was
-- written for: an amendment carries its own sentence ("koreksi nilai Hb,
-- entri sebelumnya tertukar"), and the superseded version keeps the one it
-- was released with — the same rule `lab_results` versions follow. Nullable
-- with no default: most sheets have nothing to say, and a note nobody wrote
-- renders nothing rather than an empty box.

-- AlterTable
ALTER TABLE "lab_reports" ADD COLUMN "note" TEXT;
