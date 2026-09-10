-- P19-T10 (SJ-167): Indonesian region master data and a structured patient
-- address.
--
-- Four tables keyed by the Kemendagri `kode wilayah` (`11`, `11.01`,
-- `11.01.01`, `11.01.01.2001`) — the code SATUSEHAT's `administrativeCode`
-- extension carries — each pointing at its parent with `ON DELETE RESTRICT`,
-- because a region with patients in it must be deactivated, never removed.
-- Rows arrive from `prisma/wilayah.sql` on `pnpm db:seed`, not from this
-- migration: ~91k rows are seed data, and a migration that carried them
-- would replay them on every fresh database in CI.
--
-- `patient_profiles` gains the four codes plus RT/RW and postal code, all
-- nullable: every existing row predates the master data and a chat-made draft
-- carries no address at all. `address` keeps its name and stays the street
-- line — renaming it would touch the invoice token, the arrival worklist and
-- every existing row for no gain.
--
-- Rollback: drop the seven FK constraints, the four `patient_profiles_*_idx`
-- indexes and six columns, then the four tables in reverse order. No data
-- outside the new columns and tables is touched.

-- AlterTable
ALTER TABLE "patient_profiles" ADD COLUMN     "district_code" TEXT,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "province_code" TEXT,
ADD COLUMN     "regency_code" TEXT,
ADD COLUMN     "rt_rw" TEXT,
ADD COLUMN     "village_code" TEXT;

-- CreateTable
CREATE TABLE "provinces" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "regencies" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "province_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "districts" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regency_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "villages" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "villages_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "regencies_province_code_idx" ON "regencies"("province_code");

-- CreateIndex
CREATE INDEX "districts_regency_code_idx" ON "districts"("regency_code");

-- CreateIndex
CREATE INDEX "villages_district_code_name_idx" ON "villages"("district_code", "name");

-- CreateIndex
CREATE INDEX "patient_profiles_province_code_idx" ON "patient_profiles"("province_code");

-- CreateIndex
CREATE INDEX "patient_profiles_regency_code_idx" ON "patient_profiles"("regency_code");

-- CreateIndex
CREATE INDEX "patient_profiles_district_code_idx" ON "patient_profiles"("district_code");

-- CreateIndex
CREATE INDEX "patient_profiles_village_code_idx" ON "patient_profiles"("village_code");

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_regency_code_fkey" FOREIGN KEY ("regency_code") REFERENCES "regencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_district_code_fkey" FOREIGN KEY ("district_code") REFERENCES "districts"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_village_code_fkey" FOREIGN KEY ("village_code") REFERENCES "villages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regencies" ADD CONSTRAINT "regencies_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_regency_code_fkey" FOREIGN KEY ("regency_code") REFERENCES "regencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "villages" ADD CONSTRAINT "villages_district_code_fkey" FOREIGN KEY ("district_code") REFERENCES "districts"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
