-- P18-T10 (SJ-149): a lab request that did not come from a consultation.
--
-- Split from the table changes that follow, as every enum addition in this
-- repo is: PostgreSQL cannot use a value in the transaction that added it.

-- CreateEnum
-- Where the request came from. ENCOUNTER is a doctor of this clinic ordering
-- during a visit — everything before this ticket. WALK_IN is a patient asking
-- for a panel with no consultation; EXTERNAL_REFERRAL is a patient arriving
-- with a request letter from a doctor elsewhere. The last two are separated
-- because only one of them has an outside requester to name and to print on
-- the report.
CREATE TYPE "lab_order_source" AS ENUM ('ENCOUNTER', 'WALK_IN', 'EXTERNAL_REFERRAL');

-- CreateEnum
-- What a visit is for. A LAB_ONLY registration exists for the MRN, the bill
-- and the audit trail; it takes no poli queue number and opens no encounter,
-- because no doctor sees the patient. Defaulted to CONSULTATION so every row
-- written before this ticket keeps exactly the meaning it had.
CREATE TYPE "registration_type" AS ENUM ('CONSULTATION', 'LAB_ONLY');
