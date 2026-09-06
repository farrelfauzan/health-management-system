-- P10-T13 (SJ-79): partial IHS number for display, mirroring nik_last4.
--
-- The patient IHS number had only ciphertext and a key version, so the UI
-- could say "tertaut" and nothing else. When a submission is disputed, staff
-- cannot match what we hold against the number in the SATUSEHAT portal without
-- an audited reveal for every glance. Same asymmetry P7-T07 established for
-- NIK: partial for display, full only through the audited route.
--
-- Nullable, no backfill in SQL. Existing linked rows are filled by
-- `apps/api/scripts/backfill-satusehat-last4.ts`, which has to decrypt to
-- derive the value — something a migration cannot do, since the key lives in
-- the application's environment, not the database.

-- AlterTable
ALTER TABLE "patient_profiles" ADD COLUMN "satusehat_patient_id_last4" TEXT;
