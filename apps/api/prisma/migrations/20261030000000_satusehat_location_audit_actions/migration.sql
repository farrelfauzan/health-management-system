-- P24-T06. The audit verbs for registering a clinic row as a SATUSEHAT
-- Location and for pushing a registered row's rename or deactivation. In a
-- migration of their own, ahead of any code that writes them: Postgres will not
-- let an enum value be added and then referenced in the same transaction.
--
-- Stamped 20261030 so it sorts after P24-T04's 20261029 migration, which is on
-- its own branch and not yet merged.
ALTER TYPE "AuditAction" ADD VALUE 'SATUSEHAT_LOCATION_REGISTERED';
ALTER TYPE "AuditAction" ADD VALUE 'SATUSEHAT_LOCATION_UPDATED';
