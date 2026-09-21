-- P25-T08 (SJ-231): which pregnancy an EPISODE_OF_CARE_FINISH row closes.
--
-- Nullable, and set on that kind alone: an ENCOUNTER row reaches its episode
-- through its antenatal visit, and a LAB_REPORT row has no pregnancy at all.
-- The column says the row *is* that pregnancy's close, the same way
-- `encounter_id` says an ENCOUNTER row is that encounter's.

ALTER TABLE "satusehat_submissions"
  ADD COLUMN "pregnancy_episode_id" UUID;

ALTER TABLE "satusehat_submissions"
  ADD CONSTRAINT "satusehat_submissions_pregnancy_episode_id_fkey"
  FOREIGN KEY ("pregnancy_episode_id") REFERENCES "pregnancy_episodes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "satusehat_submissions_pregnancy_episode_id_idx"
  ON "satusehat_submissions"("pregnancy_episode_id");

-- One *open* close per pregnancy. Not one row per pregnancy: correcting the
-- birth time after a close has already been sent must be able to enqueue a
-- second PATCH, which is why the predicate names the unsettled statuses rather
-- than the kind alone. This mirrors
-- `satusehat_submissions_lab_order_open_key`.
CREATE UNIQUE INDEX "satusehat_submissions_pregnancy_episode_open_key"
  ON "satusehat_submissions"("pregnancy_episode_id")
  WHERE "kind" = 'EPISODE_OF_CARE_FINISH' AND "status" <> 'SUBMITTED';

-- Each kind carries exactly its own key column and neither of the others.
--
-- This replaces the two-kind constraint from the lab-report outbox rather than
-- adding a second one beside it: that one is an exhaustive OR over the kinds it
-- knew about, so a row of a third kind satisfies no branch and is refused —
-- with both its other columns correctly null.
ALTER TABLE "satusehat_submissions"
  DROP CONSTRAINT "satusehat_submissions_kind_key_check";

ALTER TABLE "satusehat_submissions" ADD CONSTRAINT "satusehat_submissions_kind_key_check" CHECK (
    ("kind" = 'ENCOUNTER' AND "encounter_id" IS NOT NULL AND "lab_order_id" IS NULL AND "pregnancy_episode_id" IS NULL)
    OR
    ("kind" = 'LAB_REPORT' AND "lab_order_id" IS NOT NULL AND "encounter_id" IS NULL AND "pregnancy_episode_id" IS NULL)
    OR
    ("kind" = 'EPISODE_OF_CARE_FINISH' AND "pregnancy_episode_id" IS NOT NULL AND "encounter_id" IS NULL AND "lab_order_id" IS NULL)
);
