-- CreateTable
CREATE TABLE "vital_signs" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "height_cm" DECIMAL(5,2),
    "weight_kg" DECIMAL(5,2),
    "systolic_blood_pressure" INTEGER,
    "diastolic_blood_pressure" INTEGER,
    "pulse_rate" INTEGER,
    "respiratory_rate" INTEGER,
    "temperature_celsius" DECIMAL(4,1),
    "oxygen_saturation" INTEGER,
    "notes" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vital_signs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vital_signs_encounter_id_recorded_at_idx" ON "vital_signs"("encounter_id", "recorded_at");

-- CreateIndex
CREATE INDEX "vital_signs_deleted_at_idx" ON "vital_signs"("deleted_at");

-- AddForeignKey
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Physiological plausibility bounds. These reject impossible values (a decimal
-- typo turning 36.8 into 368), never merely abnormal ones — a critical reading
-- must stay recordable. Prisma cannot express CHECK constraints, so they are
-- written by hand here; `prisma migrate diff` ignores them and reports no drift.
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_height_cm_check" CHECK ("height_cm" IS NULL OR ("height_cm" > 0 AND "height_cm" <= 300));
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_weight_kg_check" CHECK ("weight_kg" IS NULL OR ("weight_kg" > 0 AND "weight_kg" <= 700));
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_systolic_blood_pressure_check" CHECK ("systolic_blood_pressure" IS NULL OR ("systolic_blood_pressure" BETWEEN 20 AND 400));
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_diastolic_blood_pressure_check" CHECK ("diastolic_blood_pressure" IS NULL OR ("diastolic_blood_pressure" BETWEEN 10 AND 300));
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_blood_pressure_order_check" CHECK ("systolic_blood_pressure" IS NULL OR "diastolic_blood_pressure" IS NULL OR "diastolic_blood_pressure" <= "systolic_blood_pressure");
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_pulse_rate_check" CHECK ("pulse_rate" IS NULL OR ("pulse_rate" BETWEEN 0 AND 400));
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_respiratory_rate_check" CHECK ("respiratory_rate" IS NULL OR ("respiratory_rate" BETWEEN 0 AND 150));
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_temperature_celsius_check" CHECK ("temperature_celsius" IS NULL OR ("temperature_celsius" BETWEEN 20 AND 46));
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_oxygen_saturation_check" CHECK ("oxygen_saturation" IS NULL OR ("oxygen_saturation" BETWEEN 0 AND 100));
