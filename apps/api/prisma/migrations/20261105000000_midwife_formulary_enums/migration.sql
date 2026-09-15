-- P25-T04 (FR-FORM-01). The two enum values the midwife formulary template
-- needs, in a migration of their own ahead of the table and the code that use
-- them: Postgres will not let an enum value be added and then referenced in
-- the same transaction.
--
-- Stamped 20261101 by the sprint orchestrator so it sorts after the P24
-- migrations already on main; sibling P25 tickets take 20261031 and 20261102.

-- Which of a bidan's authorities a template item sits under. OWN_AUTHORITY is
-- what Permenkes 28/2017 lets her give on her own; AUTHORITY_BOUND (P25-T05)
-- needs a doctor's delegation and is not seeded here.
CREATE TYPE "midwife_formulary_group" AS ENUM ('OWN_AUTHORITY', 'AUTHORITY_BOUND');

-- The clinic confirmed which matched catalog rows a bidan may prescribe.
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_MIDWIFE_FORMULARY_APPLIED';
