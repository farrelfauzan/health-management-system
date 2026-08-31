-- CreateTable
CREATE TABLE "clinic_profiles" (
    "id" UUID NOT NULL,
    "facility_id" UUID,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "address" TEXT,
    "phone_number" TEXT,
    "email" TEXT,
    "license_number" TEXT,
    "tax_id" TEXT,
    "logo_storage_key" TEXT,
    "logo_mime_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinic_profiles_facility_id_key" ON "clinic_profiles"("facility_id");

-- Hand-written index below. Prisma cannot express partial unique indexes and
-- `migrate diff` ignores them, so CI's drift gate stays green (same approach
-- as the two BPJS config tables). The generated unique index above treats
-- NULLs as distinct, so it does not stop a second facility-less row — this
-- partial index is what actually enforces the single-tenant singleton.
CREATE UNIQUE INDEX "clinic_profiles_default_singleton_key" ON "clinic_profiles" (("facility_id" IS NULL)) WHERE "facility_id" IS NULL;

-- Hand-written CHECKs. A profile whose name is blank renders an invoice
-- headed by nothing, and the two logo columns describe one object: a key with
-- no type would leave the signed download with no content type to pin, and a
-- type with no key names bytes that do not exist.
ALTER TABLE "clinic_profiles"
  ADD CONSTRAINT "clinic_profiles_name_not_blank" CHECK (btrim("name") <> '');

ALTER TABLE "clinic_profiles"
  ADD CONSTRAINT "clinic_profiles_logo_columns_agree"
  CHECK (("logo_storage_key" IS NULL) = ("logo_mime_type" IS NULL));
