-- P10-T18 (SJ-88): the preparation forms a racikan is compounded into.
--
-- The five a klinik pratama actually makes. Puyer is by far the commonest —
-- paediatric doses ground from adult tablets — which is the case this whole
-- ticket exists for.
--
-- Enum-only migration, split from the tables that follow as every enum
-- addition in this repo is.

-- CreateEnum
CREATE TYPE "compound_preparation" AS ENUM ('PUYER', 'KAPSUL', 'SIRUP', 'SALEP', 'OTHER');
