-- P18-T01 (SJ-141): the laboratory master data every later ticket hangs off.
--
-- Master data only — no orders yet. The split mirrors `service_tariffs` +
-- `icd10_codes`: the coded catalog lives here and the price lives in
-- `service_tariffs` (category LAB), referenced rather than duplicated, so a
-- price change never touches the coded row and a test can exist before anyone
-- has decided what to charge for it.

-- CreateTable
CREATE TABLE "lab_tests" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    -- Nullable, and the same rule KFA follows for medications: a test without
    -- a LOINC code is usable locally and simply not reported to SATUSEHAT,
    -- rather than reported under a guessed code.
    "loinc_code" TEXT,
    "loinc_display" TEXT,
    "specimen_type" "lab_specimen_type" NOT NULL,
    "result_type" "lab_result_type" NOT NULL,
    "unit" TEXT,
    "decimals" INTEGER NOT NULL DEFAULT 0,
    "coded_options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "service_tariff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "lab_tests_pkey" PRIMARY KEY ("id")
);

-- A NUMERIC test is compared against a range and therefore needs a unit; a
-- CODED test is picked from a closed list and therefore needs one. Both are
-- meaningless for the other types, so the CHECK states the pairing rather than
-- leaving it to whichever service writes the row next.
ALTER TABLE "lab_tests" ADD CONSTRAINT "lab_tests_result_shape_check" CHECK (
    ("result_type" = 'NUMERIC' AND "unit" IS NOT NULL AND cardinality("coded_options") = 0)
    OR ("result_type" = 'CODED' AND cardinality("coded_options") > 0)
    OR ("result_type" = 'TEXT' AND cardinality("coded_options") = 0)
);

ALTER TABLE "lab_tests" ADD CONSTRAINT "lab_tests_decimals_check" CHECK ("decimals" >= 0 AND "decimals" <= 6);

-- CreateTable
CREATE TABLE "lab_reference_ranges" (
    "id" UUID NOT NULL,
    "lab_test_id" UUID NOT NULL,
    -- Null means "any sex" / "any age": almost every adult range is one row
    -- with all three null, and a paediatric band is the same kind of row with
    -- bounds filled in.
    "sex" "PatientSex",
    "age_min_days" INTEGER,
    "age_max_days" INTEGER,
    "low" DECIMAL(12,4),
    "high" DECIMAL(12,4),
    "critical_low" DECIMAL(12,4),
    "critical_high" DECIMAL(12,4),
    "text_normal" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_reference_ranges_pkey" PRIMARY KEY ("id")
);

-- An inverted band or an inverted range is always a data-entry error, and one
-- that would silently flag every result in the wrong direction.
ALTER TABLE "lab_reference_ranges" ADD CONSTRAINT "lab_reference_ranges_bounds_check" CHECK (
    ("age_min_days" IS NULL OR "age_min_days" >= 0)
    AND ("age_min_days" IS NULL OR "age_max_days" IS NULL OR "age_min_days" <= "age_max_days")
    AND ("low" IS NULL OR "high" IS NULL OR "low" <= "high")
    AND ("critical_low" IS NULL OR "critical_high" IS NULL OR "critical_low" <= "critical_high")
);

-- CreateTable
CREATE TABLE "lab_panels" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "service_tariff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "lab_panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_panel_members" (
    "panel_id" UUID NOT NULL,
    "lab_test_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_panel_members_pkey" PRIMARY KEY ("panel_id","lab_test_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lab_tests_code_key" ON "lab_tests"("code");
CREATE INDEX "lab_tests_is_active_idx" ON "lab_tests"("is_active");
CREATE INDEX "lab_tests_service_tariff_id_idx" ON "lab_tests"("service_tariff_id");
CREATE INDEX "lab_tests_deleted_at_idx" ON "lab_tests"("deleted_at");

-- A LOINC code identifies one observation, so two live tests claiming the same
-- one would send two different local codes under one national identity.
-- Partial, so retiring a test frees its LOINC code for a replacement.
CREATE UNIQUE INDEX "lab_tests_loinc_code_live_key" ON "lab_tests"("loinc_code")
    WHERE "loinc_code" IS NOT NULL AND "deleted_at" IS NULL;

CREATE INDEX "lab_reference_ranges_lab_test_id_idx" ON "lab_reference_ranges"("lab_test_id");

CREATE UNIQUE INDEX "lab_panels_code_key" ON "lab_panels"("code");
CREATE INDEX "lab_panels_is_active_idx" ON "lab_panels"("is_active");
CREATE INDEX "lab_panels_service_tariff_id_idx" ON "lab_panels"("service_tariff_id");
CREATE INDEX "lab_panels_deleted_at_idx" ON "lab_panels"("deleted_at");

CREATE INDEX "lab_panel_members_lab_test_id_idx" ON "lab_panel_members"("lab_test_id");

-- AddForeignKey
ALTER TABLE "lab_tests" ADD CONSTRAINT "lab_tests_service_tariff_id_fkey" FOREIGN KEY ("service_tariff_id") REFERENCES "service_tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lab_reference_ranges" ADD CONSTRAINT "lab_reference_ranges_lab_test_id_fkey" FOREIGN KEY ("lab_test_id") REFERENCES "lab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lab_panels" ADD CONSTRAINT "lab_panels_service_tariff_id_fkey" FOREIGN KEY ("service_tariff_id") REFERENCES "service_tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lab_panel_members" ADD CONSTRAINT "lab_panel_members_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "lab_panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, not CASCADE: a test that is still a member of a panel must not be
-- deletable out from under it. Removing it from the panel is the deliberate
-- act, and soft delete is what retires the test itself.
ALTER TABLE "lab_panel_members" ADD CONSTRAINT "lab_panel_members_lab_test_id_fkey" FOREIGN KEY ("lab_test_id") REFERENCES "lab_tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
