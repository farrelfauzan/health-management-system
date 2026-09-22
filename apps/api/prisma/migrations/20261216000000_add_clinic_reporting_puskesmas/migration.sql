-- P25-T15 (D-040): the puskesmas the clinic reports its monthly KIA figures
-- to. Both nullable; nothing reads them until a clinic fills them in.
ALTER TABLE "clinic_profiles"
  ADD COLUMN "reporting_puskesmas_name" TEXT,
  ADD COLUMN "reporting_puskesmas_code" TEXT;
