-- P18-T04 (SJ-144): the measured value, and the rules this clinic verifies it
-- under.
--
-- The reference band is snapshotted onto the result at entry rather than read
-- back from the catalog at display time: a range edited in 2027 must not
-- re-flag a 2026 result, because a flag records what was abnormal by the
-- standard in force when it was measured. An amendment is a new row, never an
-- overwrite — somebody may have treated a patient on the strength of the value
-- being corrected, and the record has to be able to show what they saw.

-- CreateTable
CREATE TABLE "lab_results" (
    "id" UUID NOT NULL,
    "lab_order_item_id" UUID NOT NULL,
    -- v1 is the first entry; an amendment writes v+1 and points back at the
    -- row it corrects.
    "version" INTEGER NOT NULL DEFAULT 1,
    "value_numeric" DECIMAL(12,4),
    "value_text" TEXT,
    "value_coded" TEXT,
    "unit" TEXT,
    -- The band in force when this value was measured, snapshotted with its
    -- critical thresholds: without them an amendment could not recompute its
    -- flag against the standard the original was judged by.
    "ref_low" DECIMAL(12,4),
    "ref_high" DECIMAL(12,4),
    "ref_critical_low" DECIMAL(12,4),
    "ref_critical_high" DECIMAL(12,4),
    "ref_text" TEXT,
    -- Null when no band applied to this patient's sex and age. The value is
    -- still recorded; it is simply not judged against a range meant for
    -- somebody else.
    "flag" "lab_result_flag",
    "entered_by_id" UUID NOT NULL,
    "entered_at" TIMESTAMP(3) NOT NULL,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMP(3),
    -- Whether the single-operator rule was on at the moment of verification.
    -- History, not current state: the settings row can change afterwards, and
    -- this column is what says whether one signature was policy or a bug.
    "verified_under_single_operator" BOOLEAN NOT NULL DEFAULT false,
    "amended_from_id" UUID,
    "amend_reason" TEXT,
    "satusehat_observation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id")
);

-- Exactly one value, decided by the test's result type. A row carrying both a
-- number and prose is a row no consumer can render, and one carrying neither
-- is a result that was never measured.
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_single_value_check" CHECK (
    num_nonnulls("value_numeric", "value_text", "value_coded") = 1
);

-- A correction with no reason is the state this table must never hold: the
-- amendment row is what a disputed result is read backwards from.
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_amend_reason_check" CHECK (
    ("amended_from_id" IS NULL) OR ("amend_reason" IS NOT NULL)
);

-- Verified means both facts or neither: a verifier with no timestamp cannot be
-- placed in time, and a timestamp with no verifier names nobody.
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_verified_pair_check" CHECK (
    ("verified_by_id" IS NULL) = ("verified_at" IS NULL)
);

-- CreateIndex
-- One row per version per item: two amendments racing cannot both claim v2 and
-- silently lose one correction.
CREATE UNIQUE INDEX "lab_results_lab_order_item_id_version_key" ON "lab_results"("lab_order_item_id", "version");

-- CreateIndex
CREATE INDEX "lab_results_lab_order_item_id_idx" ON "lab_results"("lab_order_item_id");

-- CreateIndex
CREATE INDEX "lab_results_amended_from_id_idx" ON "lab_results"("amended_from_id");

-- AddForeignKey
-- Results live and die with the item they measure, as specimens do with their
-- order.
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_lab_order_item_id_fkey" FOREIGN KEY ("lab_order_item_id") REFERENCES "lab_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT on both operators: an account that signed a clinical value cannot
-- be deleted out from under the row that names it.
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_entered_by_id_fkey" FOREIGN KEY ("entered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_amended_from_id_fkey" FOREIGN KEY ("amended_from_id") REFERENCES "lab_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
-- Who may sign a result out is a clinical governance choice a clinic makes and
-- may later be asked to justify, so it is a row with an actor and a timestamp
-- rather than deployment configuration. Modelled on `bpjs_pcare_configs` and
-- `ai_provider_configs`, the pattern this repo already uses for operational
-- switches.
CREATE TABLE "laboratory_settings" (
    "id" UUID NOT NULL,
    "facility_id" UUID,
    -- Both default to the strict posture, and no row at all means the same: a
    -- fresh database verifies with two different people and refuses a
    -- technician's signature. A clinic loosens either one deliberately.
    "technician_may_verify" BOOLEAN NOT NULL DEFAULT false,
    "single_operator" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laboratory_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "laboratory_settings_facility_id_key" ON "laboratory_settings"("facility_id");

-- CreateIndex
-- PostgreSQL treats NULLs as distinct in a unique index, so the constraint
-- above does not make the single-tenant row a singleton. This one does.
CREATE UNIQUE INDEX "laboratory_settings_default_singleton_key" ON "laboratory_settings" (("facility_id" IS NULL)) WHERE "facility_id" IS NULL;

-- AddForeignKey
-- SET NULL: the setting outlives the account that last changed it.
ALTER TABLE "laboratory_settings" ADD CONSTRAINT "laboratory_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
