-- IMP-6: per-client feature entitlements.
--
-- Nothing in HMS could say "this clinic did not buy BPJS" until now, so the AI
-- chatbot invented its own pair of switches (`AI_CHAT_ENABLED` and
-- `AiProviderConfig.isEnabled`) and every later module would have invented
-- another. One table, one row per catalog key, is the switch every optional
-- feature shares from here on.
--
-- Keys are code-owned (`FEATURE_CATALOG` in `@hms/shared-types`); the seed
-- converges this table onto that list. `facility_id` is the same nullable
-- tenant seam that already exists on `mrn_counters`, `bpjs_pcare_configs`,
-- `bpjs_antrean_configs`, and `ai_provider_configs` — under the recorded
-- one-database-per-tenant decision the rows are per-client already.

-- CreateTable
CREATE TABLE "feature_entitlements" (
    "id" UUID NOT NULL,
    "facility_id" UUID,
    "feature_key" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feature_entitlements_feature_key_key" ON "feature_entitlements"("feature_key");

-- CreateIndex
CREATE INDEX "feature_entitlements_facility_id_idx" ON "feature_entitlements"("facility_id");

-- AddForeignKey
ALTER TABLE "feature_entitlements" ADD CONSTRAINT "feature_entitlements_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
