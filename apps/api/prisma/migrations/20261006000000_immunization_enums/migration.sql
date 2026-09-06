-- P10-T16 (SJ-139): the enums an immunisation record needs.
--
-- Route and site are what the IG's Immunization asks for and what a nurse
-- writes on the card anyway; both map onto HL7 v3 code systems in the mapper
-- rather than storing the v3 codes here, so a coding correction stays an
-- adapter change.
--
-- Split from the table that follows, as every enum addition in this repo is.

-- CreateEnum
CREATE TYPE "immunization_route" AS ENUM ('IM', 'SC', 'ID', 'ORAL', 'NASAL');

-- CreateEnum
CREATE TYPE "immunization_site" AS ENUM ('LEFT_ARM', 'RIGHT_ARM', 'LEFT_THIGH', 'RIGHT_THIGH', 'OTHER');

-- P10-T16 (NFR-AUD-03). Recording and retracting a vaccination, in the same
-- table as every other clinical verb.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'IMMUNIZATION_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'IMMUNIZATION_REMOVED';
