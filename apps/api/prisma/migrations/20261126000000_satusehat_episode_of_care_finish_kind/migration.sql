-- P25-T08 (SJ-231): a third submission kind, which closes a pregnancy's ANC
-- EpisodeOfCare on SATUSEHAT.
--
-- Its own migration because PostgreSQL will not let a value added to an enum
-- be used in the same transaction that added it, and the next migration puts
-- a partial index on rows filtered by this value.

ALTER TYPE "satusehat_submission_kind" ADD VALUE IF NOT EXISTS 'EPISODE_OF_CARE_FINISH';
