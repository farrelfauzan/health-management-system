-- CreateEnum
CREATE TYPE "BpjsPcareEnvironment" AS ENUM ('DEVELOPMENT', 'PRODUCTION');

-- CreateTable
CREATE TABLE "bpjs_pcare_configs" (
    "id" UUID NOT NULL,
    "facility_id" UUID,
    "environment" "BpjsPcareEnvironment" NOT NULL,
    "cons_id" TEXT NOT NULL,
    "kd_provider_ppk" TEXT NOT NULL,
    "pcare_username" TEXT NOT NULL,
    "secret_key_ciphertext" TEXT NOT NULL,
    "secret_key_last4" TEXT NOT NULL,
    "user_key_ciphertext" TEXT NOT NULL,
    "user_key_last4" TEXT NOT NULL,
    "pcare_password_ciphertext" TEXT NOT NULL,
    "credential_key_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_tested_at" TIMESTAMP(3),
    "last_test_result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bpjs_pcare_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bpjs_pcare_configs_facility_id_key" ON "bpjs_pcare_configs"("facility_id");

-- Hand-written index below. Prisma cannot express partial unique indexes and
-- `migrate diff` ignores them, so CI's drift gate stays green (same approach
-- as the diagnosis/invoice migrations). The generated unique index above
-- treats NULLs as distinct, so it does not stop a second facility-less row —
-- this partial index is what actually enforces the single-tenant singleton.
CREATE UNIQUE INDEX "bpjs_pcare_configs_default_singleton_key" ON "bpjs_pcare_configs" (("facility_id" IS NULL)) WHERE "facility_id" IS NULL;
