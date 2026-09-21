-- P25-T09 (SJ-232): the delivery record, the newborn essentials, and the two
-- enum values the birth certificate needs.
--
-- One `delivery_records` row per pregnancy and one `newborn_care_records` row
-- per baby: twins are one labour with two babies, and modelling them as two
-- deliveries would give one pregnancy two endings.

CREATE TYPE "delivery_mode" AS ENUM ('SPONTANEOUS_VAGINAL', 'ASSISTED_VAGINAL', 'CAESAREAN');
CREATE TYPE "perineal_tear_grade" AS ENUM ('NONE', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4');
CREATE TYPE "birth_outcome" AS ENUM ('LIVE_BIRTH', 'STILLBIRTH');

CREATE TABLE "delivery_records" (
    "id" UUID NOT NULL,
    "pregnancy_episode_id" UUID NOT NULL,
    "admission_id" UUID,
    "attendant_doctor_id" UUID NOT NULL,
    "labour_onset_at" TIMESTAMPTZ(3),
    "full_dilatation_at" TIMESTAMPTZ(3),
    "birth_at" TIMESTAMPTZ(3) NOT NULL,
    "placenta_delivered_at" TIMESTAMPTZ(3),
    "postpartum_monitoring_ended_at" TIMESTAMPTZ(3),
    "mode" "delivery_mode" NOT NULL,
    "episiotomy" BOOLEAN NOT NULL DEFAULT false,
    "perineal_tear_grade" "perineal_tear_grade" NOT NULL DEFAULT 'NONE',
    "uterotonic_medication_id" UUID,
    "uterotonic_given_at" TIMESTAMPTZ(3),
    "blood_loss_ml" INTEGER,
    "placenta_complete" BOOLEAN,
    "referred_out" BOOLEAN NOT NULL DEFAULT false,
    "referral_reason" TEXT,
    "notes" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_records_pregnancy_episode_id_key"
  ON "delivery_records"("pregnancy_episode_id");
CREATE INDEX "delivery_records_admission_id_idx" ON "delivery_records"("admission_id");
CREATE INDEX "delivery_records_attendant_doctor_id_idx" ON "delivery_records"("attendant_doctor_id");
CREATE INDEX "delivery_records_recorded_by_id_idx" ON "delivery_records"("recorded_by_id");

-- The stages happen in order. Each check ignores the pair where either side is
-- null, because a woman who arrives pushing has no recorded onset and a
-- half-filled record is the ordinary case, not an invalid one.
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_stage_order_check" CHECK (
  ("labour_onset_at" IS NULL OR "full_dilatation_at" IS NULL OR "labour_onset_at" <= "full_dilatation_at")
  AND ("full_dilatation_at" IS NULL OR "full_dilatation_at" <= "birth_at")
  AND ("labour_onset_at" IS NULL OR "labour_onset_at" <= "birth_at")
  AND ("placenta_delivered_at" IS NULL OR "birth_at" <= "placenta_delivered_at")
  AND ("placenta_delivered_at" IS NULL OR "postpartum_monitoring_ended_at" IS NULL
       OR "placenta_delivered_at" <= "postpartum_monitoring_ended_at")
  AND ("postpartum_monitoring_ended_at" IS NULL OR "birth_at" <= "postpartum_monitoring_ended_at")
);

-- A referral has a reason, and a reason belongs to a referral.
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_referral_reason_check" CHECK (
  "referred_out" = true OR "referral_reason" IS NULL
);

-- A uterotonic is a drug and a time together; half of that says nothing.
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_uterotonic_check" CHECK (
  ("uterotonic_medication_id" IS NULL) = ("uterotonic_given_at" IS NULL)
);

ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_blood_loss_check"
  CHECK ("blood_loss_ml" IS NULL OR "blood_loss_ml" >= 0);

CREATE TABLE "newborn_care_records" (
    "id" UUID NOT NULL,
    "delivery_record_id" UUID NOT NULL,
    "outcome" "birth_outcome" NOT NULL,
    "stillbirth_order" INTEGER,
    "newborn_patient_id" UUID,
    "sex" "PatientSex" NOT NULL,
    "birth_weight_grams" INTEGER,
    "length_cm" DECIMAL(4,1),
    "head_circumference_cm" DECIMAL(4,1),
    "apgar_1_min" INTEGER,
    "apgar_5_min" INTEGER,
    "imd_started_at" TIMESTAMPTZ(3),
    "imd_duration_minutes" INTEGER,
    "cord_care_at" TIMESTAMPTZ(3),
    "vitamin_k1_given_at" TIMESTAMPTZ(3),
    "vitamin_k1_medication_id" UUID,
    "eye_prophylaxis_given_at" TIMESTAMPTZ(3),
    "eye_prophylaxis_medication_id" UUID,
    "hb0_immunization_id" UUID,
    "examined_at" TIMESTAMPTZ(3),
    "identity_tag_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newborn_care_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "newborn_care_records_delivery_record_id_idx"
  ON "newborn_care_records"("delivery_record_id");
-- One care record per registered baby, and one stillbirth order per birth.
CREATE UNIQUE INDEX "newborn_care_records_newborn_patient_id_key"
  ON "newborn_care_records"("newborn_patient_id");
CREATE UNIQUE INDEX "newborn_care_records_delivery_record_id_stillbirth_order_key"
  ON "newborn_care_records"("delivery_record_id", "stillbirth_order");

-- A stillbirth order belongs to a stillbirth, and every stillbirth has one.
-- A live baby's order lives on her patient record instead (P24-T10).
ALTER TABLE "newborn_care_records" ADD CONSTRAINT "newborn_care_records_stillbirth_order_check" CHECK (
  ("outcome" = 'STILLBIRTH') = ("stillbirth_order" IS NOT NULL)
);

-- A stillborn baby is never a registered patient.
ALTER TABLE "newborn_care_records" ADD CONSTRAINT "newborn_care_records_stillbirth_patient_check" CHECK (
  "outcome" = 'LIVE_BIRTH' OR "newborn_patient_id" IS NULL
);

ALTER TABLE "newborn_care_records" ADD CONSTRAINT "newborn_care_records_apgar_check" CHECK (
  ("apgar_1_min" IS NULL OR ("apgar_1_min" BETWEEN 0 AND 10))
  AND ("apgar_5_min" IS NULL OR ("apgar_5_min" BETWEEN 0 AND 10))
);

ALTER TABLE "newborn_care_records" ADD CONSTRAINT "newborn_care_records_measures_check" CHECK (
  ("birth_weight_grams" IS NULL OR "birth_weight_grams" > 0)
  AND ("length_cm" IS NULL OR "length_cm" > 0)
  AND ("head_circumference_cm" IS NULL OR "head_circumference_cm" > 0)
  AND ("imd_duration_minutes" IS NULL OR "imd_duration_minutes" >= 0)
);

ALTER TABLE "newborn_care_records" ADD CONSTRAINT "newborn_care_records_vitamin_k1_check" CHECK (
  ("vitamin_k1_medication_id" IS NULL) = ("vitamin_k1_given_at" IS NULL)
);

ALTER TABLE "newborn_care_records" ADD CONSTRAINT "newborn_care_records_eye_prophylaxis_check" CHECK (
  ("eye_prophylaxis_medication_id" IS NULL) = ("eye_prophylaxis_given_at" IS NULL)
);

ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_pregnancy_episode_id_fkey"
  FOREIGN KEY ("pregnancy_episode_id") REFERENCES "pregnancy_episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_admission_id_fkey"
  FOREIGN KEY ("admission_id") REFERENCES "admissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_attendant_doctor_id_fkey"
  FOREIGN KEY ("attendant_doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_uterotonic_medication_id_fkey"
  FOREIGN KEY ("uterotonic_medication_id") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_recorded_by_id_fkey"
  FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "newborn_care_records" ADD CONSTRAINT "newborn_care_records_delivery_record_id_fkey"
  FOREIGN KEY ("delivery_record_id") REFERENCES "delivery_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "newborn_care_records" ADD CONSTRAINT "newborn_care_records_newborn_patient_id_fkey"
  FOREIGN KEY ("newborn_patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "newborn_care_records" ADD CONSTRAINT "newborn_care_records_vitamin_k1_medication_id_fkey"
  FOREIGN KEY ("vitamin_k1_medication_id") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "newborn_care_records" ADD CONSTRAINT "newborn_care_records_eye_prophylaxis_medication_id_fkey"
  FOREIGN KEY ("eye_prophylaxis_medication_id") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "newborn_care_records" ADD CONSTRAINT "newborn_care_records_hb0_immunization_id_fkey"
  FOREIGN KEY ("hb0_immunization_id") REFERENCES "immunizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
