-- P10-T15 (SJ-87): the prognosis vocabulary a doctor picks from.
--
-- The four Latin terms Indonesian clinicians actually write (bonam, dubia ad
-- bonam, dubia ad malam, malam) rather than the three SNOMED grades they map
-- onto. Keeping the local value is the point: the mapper sends the SNOMED code
-- and echoes the recorded term in `text`, so what the doctor chose survives
-- the translation.
--
-- Enum-only migration, split from the column that follows: PostgreSQL cannot
-- use an enum value in the transaction that created the type.

-- CreateEnum
CREATE TYPE "encounter_prognosis" AS ENUM ('BONAM', 'DUBIA_AD_BONAM', 'DUBIA_AD_MALAM', 'MALAM');
