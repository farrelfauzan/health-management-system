-- P25-T16 (SJ-239): the BPJS bidan jejaring non-capitation recap.
--
-- Three tables: the induk FKTP settings (a singleton, D-043), the tariffs by
-- validity window, and the marks that say a derived recap line was handed to
-- the induk. The lines themselves are derived on read and never stored.

CREATE TABLE "bpjs_non_capitation_settings" (
    "id" UUID NOT NULL,
    "facility_id" UUID,
    "network_parent_provider_code" TEXT,
    "network_parent_provider_name" TEXT,
    "is_network_parent_government_owned" BOOLEAN,
    "has_own_eclaim_login" BOOLEAN,
    "filing_day_of_month" INTEGER NOT NULL DEFAULT 10,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bpjs_non_capitation_settings_pkey" PRIMARY KEY ("id"),
    -- 1–28 so every month has the day; the 10th is Permenkes 28/2014's default.
    CONSTRAINT "bpjs_non_capitation_settings_filing_day_check"
        CHECK ("filing_day_of_month" BETWEEN 1 AND 28)
);

CREATE TABLE "bpjs_non_capitation_tariffs" (
    "id" UUID NOT NULL,
    "service_type" "non_capitation_service_type" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "regulation_reference" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bpjs_non_capitation_tariffs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bpjs_non_capitation_tariffs_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "bpjs_non_capitation_tariffs_validity_check"
        CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from"),
    CONSTRAINT "bpjs_non_capitation_tariffs_reference_check"
        CHECK (length(btrim("regulation_reference")) > 0)
);

CREATE TABLE "bpjs_non_capitation_claim_marks" (
    "id" UUID NOT NULL,
    "service_type" "non_capitation_service_type" NOT NULL,
    "source_id" UUID NOT NULL,
    "claim_month" DATE NOT NULL,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marked_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bpjs_non_capitation_claim_marks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bpjs_non_capitation_claim_marks_month_check"
        CHECK (EXTRACT(DAY FROM "claim_month") = 1)
);

CREATE UNIQUE INDEX "bpjs_non_capitation_settings_facility_id_key" ON "bpjs_non_capitation_settings"("facility_id");
-- Postgres treats NULLs as distinct, so this is what keeps the single-tenant
-- row a singleton.
CREATE UNIQUE INDEX "bpjs_non_capitation_settings_default_singleton_key" ON "bpjs_non_capitation_settings" (("facility_id" IS NULL)) WHERE "facility_id" IS NULL;
CREATE INDEX "bpjs_non_capitation_settings_updated_by_id_idx" ON "bpjs_non_capitation_settings"("updated_by_id");

CREATE INDEX "bpjs_non_capitation_tariffs_created_by_id_idx" ON "bpjs_non_capitation_tariffs"("created_by_id");
CREATE UNIQUE INDEX "bpjs_non_capitation_tariffs_service_type_valid_from_key" ON "bpjs_non_capitation_tariffs"("service_type", "valid_from");

CREATE INDEX "bpjs_non_capitation_claim_marks_claim_month_idx" ON "bpjs_non_capitation_claim_marks"("claim_month");
CREATE INDEX "bpjs_non_capitation_claim_marks_marked_by_id_idx" ON "bpjs_non_capitation_claim_marks"("marked_by_id");
CREATE UNIQUE INDEX "bpjs_non_capitation_claim_marks_service_type_source_id_key" ON "bpjs_non_capitation_claim_marks"("service_type", "source_id");

ALTER TABLE "bpjs_non_capitation_settings" ADD CONSTRAINT "bpjs_non_capitation_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bpjs_non_capitation_tariffs" ADD CONSTRAINT "bpjs_non_capitation_tariffs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bpjs_non_capitation_claim_marks" ADD CONSTRAINT "bpjs_non_capitation_claim_marks_marked_by_id_fkey" FOREIGN KEY ("marked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
