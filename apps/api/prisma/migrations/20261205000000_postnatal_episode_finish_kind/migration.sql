-- P25-T12 (SJ-235): a fourth submission kind, which closes a birth's PNC
-- EpisodeOfCare on SATUSEHAT.
--
-- Not a parameter on EPISODE_OF_CARE_FINISH: that kind is keyed to the
-- pregnancy by `satusehat_submissions_pregnancy_episode_open_key`, one open
-- close per pregnancy. The same pregnancy owns both the ANC and the PNC
-- episode, and an ANC close still retrying on day 42 would make the PNC close
-- collide with it — and the row could not say which episode it closes.
--
-- Its own migration because PostgreSQL will not let a value added to an enum
-- be used in the same transaction that added it, and the next migration puts
-- a partial index and a CHECK on rows filtered by this value.

ALTER TYPE "satusehat_submission_kind" ADD VALUE IF NOT EXISTS 'POSTNATAL_EPISODE_FINISH';
