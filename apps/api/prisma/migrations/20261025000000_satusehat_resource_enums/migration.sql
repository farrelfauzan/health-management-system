-- The two enums the per-submission resource list uses (P21-T02), in their own
-- migration ahead of the table that references them: Postgres will not let a
-- type be created and then used in the same transaction as some deployments
-- run it, which is the same split the bug-report triage enums needed.

-- Whether one item of a submission reached the national record. SKIPPED is not
-- a failed submission — the bundle went, and this item was deliberately left
-- out of it.
CREATE TYPE "satusehat_resource_outcome" AS ENUM ('SENT', 'SKIPPED');

-- Why an item was left out. Every value is a category and never the item
-- itself: an administrator reading the monitor may learn that two medications
-- were skipped for want of a KFA code, but not which medications, because a
-- medication name says what the patient was prescribed.
--
-- Every value is a mapping gap the submission service already logs and then
-- forgets, except NO_VERIFIED_RESULT, which is bench work nobody has signed off.
--
-- A resource whose id could not be paired out of the transaction response is
-- deliberately absent: it was sent, so it is recorded SENT with a null
-- satusehat_id. Calling that a skip would claim the national record lacks
-- something it holds.
CREATE TYPE "satusehat_resource_skip_reason" AS ENUM (
  'NO_KFA_CODE',
  'NO_ICD9CM_CODE',
  'NO_LOINC_CODE',
  'NO_VERIFIED_RESULT',
  'UNCODED_COMPOUND_COMPONENT'
);
