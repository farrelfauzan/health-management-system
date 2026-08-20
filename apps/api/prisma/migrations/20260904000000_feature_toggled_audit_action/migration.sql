-- IMP-7: entitlement toggle audit.
--
-- Switching a feature off silences endpoints for every user of the deployment
-- at once, which makes it the widest-blast-radius admin action in the product
-- and the one most likely to be asked about after the fact ("why did BPJS stop
-- working on the 14th"). It gets its own verb rather than a generic UPDATE so
-- that question is answerable with a single filtered query.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'FEATURE_TOGGLED';
