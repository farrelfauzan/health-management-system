-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BPJS_REFERENCE_SYNCED';
ALTER TYPE "AuditAction" ADD VALUE 'BPJS_MAPPING_UPDATED';

-- CreateEnum
CREATE TYPE "BpjsReferenceCatalog" AS ENUM ('POLI', 'DOKTER', 'KESADARAN', 'TINDAKAN', 'DIAGNOSA', 'DPHO', 'SPESIALIS', 'SARANA');

-- CreateTable
CREATE TABLE "bpjs_reference_items" (
    "id" UUID NOT NULL,
    "catalog" "BpjsReferenceCatalog" NOT NULL,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "group_code" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bpjs_reference_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bpjs_reference_items_catalog_code_key" ON "bpjs_reference_items"("catalog", "code");

-- CreateIndex
CREATE INDEX "bpjs_reference_items_catalog_display_idx" ON "bpjs_reference_items"("catalog", "display");

-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN "bpjs_doctor_code" TEXT;

-- AlterTable
ALTER TABLE "specialties" ADD COLUMN "bpjs_poli_code" TEXT;

-- AlterTable
ALTER TABLE "medications" ADD COLUMN "dpho_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "medications_dpho_code_key" ON "medications"("dpho_code");
