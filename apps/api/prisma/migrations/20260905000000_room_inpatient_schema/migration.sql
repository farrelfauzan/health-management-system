-- IMP-11: room inventory and inpatient admissions.
--
-- Nothing inpatient existed in the schema; the only artifact was the inert
-- `PatientStatus.IN_PATIENT` value on `patient_profiles.status`, which nothing
-- could ever set. The outpatient chain is untouched on purpose:
-- `encounters.registration_id` is UNIQUE (one encounter per registration by
-- design) and `EncounterStatus` is terminal once closed, so a multi-day stay
-- cannot ride on `encounters` and gets its own aggregate here.
--
-- room_classes -> wards -> rooms -> beds is the inventory tree; `admissions` +
-- `bed_assignments` are the stay and its bed history.
--
-- `room_classes` is master data rather than an enum, for the same reason
-- `specialties` is: a clinic with a "Suite" or a "Kelas 3B" would otherwise
-- need a migration to sell a bed it already has. The four classes BPJS
-- recognises arrive as seeded baseline rows (IMP-12), not as type values.
--
-- The partial unique indexes at the bottom are the real concurrency guards --
-- see the comments there.

-- CreateEnum
CREATE TYPE "bed_status" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "admission_status" AS ENUM ('ADMITTED', 'DISCHARGED', 'CANCELLED');

-- CreateTable
CREATE TABLE "room_classes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quota" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "room_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wards" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "wards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "ward_id" UUID NOT NULL,
    "room_class_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beds" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "bed_status" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "beds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admissions" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "admitting_doctor_id" UUID NOT NULL,
    "source_encounter_id" UUID,
    "status" "admission_status" NOT NULL DEFAULT 'ADMITTED',
    "reason" TEXT,
    "admitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discharged_at" TIMESTAMP(3),
    "discharge_summary" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bed_assignments" (
    "id" UUID NOT NULL,
    "admission_id" UUID NOT NULL,
    "bed_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bed_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_classes_is_active_idx" ON "room_classes"("is_active");

-- CreateIndex
CREATE INDEX "room_classes_deleted_at_idx" ON "room_classes"("deleted_at");

-- CreateIndex
CREATE INDEX "wards_is_active_idx" ON "wards"("is_active");

-- CreateIndex
CREATE INDEX "wards_deleted_at_idx" ON "wards"("deleted_at");

-- CreateIndex
CREATE INDEX "rooms_ward_id_idx" ON "rooms"("ward_id");

-- CreateIndex
CREATE INDEX "rooms_room_class_id_idx" ON "rooms"("room_class_id");

-- CreateIndex
CREATE INDEX "rooms_is_active_idx" ON "rooms"("is_active");

-- CreateIndex
CREATE INDEX "rooms_deleted_at_idx" ON "rooms"("deleted_at");

-- CreateIndex
CREATE INDEX "beds_room_id_idx" ON "beds"("room_id");

-- CreateIndex
CREATE INDEX "beds_status_idx" ON "beds"("status");

-- CreateIndex
CREATE INDEX "beds_deleted_at_idx" ON "beds"("deleted_at");

-- CreateIndex
CREATE INDEX "admissions_patient_id_admitted_at_idx" ON "admissions"("patient_id", "admitted_at");

-- CreateIndex
CREATE INDEX "admissions_admitting_doctor_id_admitted_at_idx" ON "admissions"("admitting_doctor_id", "admitted_at");

-- CreateIndex
CREATE INDEX "admissions_status_admitted_at_idx" ON "admissions"("status", "admitted_at");

-- CreateIndex
CREATE INDEX "admissions_source_encounter_id_idx" ON "admissions"("source_encounter_id");

-- CreateIndex
CREATE INDEX "admissions_deleted_at_idx" ON "admissions"("deleted_at");

-- CreateIndex
CREATE INDEX "bed_assignments_admission_id_started_at_idx" ON "bed_assignments"("admission_id", "started_at");

-- CreateIndex
CREATE INDEX "bed_assignments_bed_id_started_at_idx" ON "bed_assignments"("bed_id", "started_at");

-- CreateIndex
CREATE INDEX "bed_assignments_ended_at_idx" ON "bed_assignments"("ended_at");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_class_id_fkey" FOREIGN KEY ("room_class_id") REFERENCES "room_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beds" ADD CONSTRAINT "beds_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_admitting_doctor_id_fkey" FOREIGN KEY ("admitting_doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_source_encounter_id_fkey" FOREIGN KEY ("source_encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_assignments" ADD CONSTRAINT "bed_assignments_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "admissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_assignments" ADD CONSTRAINT "bed_assignments_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "beds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_assignments" ADD CONSTRAINT "bed_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Room-class, ward, room and bed codes are unique among *live* rows only.
-- Prisma cannot express a partial unique index, so these are hand-written --
-- the same technique `procedures_encounter_id_code_key` and
-- `invoices_encounter_id_live_key` already use. Soft-deleting a closed ward
-- frees its code for the replacement that takes its place on the floor plan,
-- and the same goes for a retired room class.
CREATE UNIQUE INDEX "room_classes_code_live_key" ON "room_classes" ("code") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "wards_code_live_key" ON "wards" ("code") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "rooms_ward_id_code_live_key" ON "rooms" ("ward_id", "code") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "beds_room_id_code_live_key" ON "beds" ("room_id", "code") WHERE "deleted_at" IS NULL;

-- A quota is a planned bed count, so zero would mean "this class may have no
-- beds" and a negative number means nothing at all. NULL stays allowed and is
-- how a clinic says "uncapped".
ALTER TABLE "room_classes"
  ADD CONSTRAINT "room_classes_quota_positive_check"
  CHECK ("quota" IS NULL OR "quota" > 0);

-- The double-booking guard. `beds.status` is a cached projection maintained by
-- the admit/transfer/discharge transactions (IMP-14) and is *not* authoritative:
-- two concurrent admits would both read AVAILABLE. This index is what makes one
-- of them lose, because an open assignment is the row that cannot be duplicated.
CREATE UNIQUE INDEX "bed_assignments_bed_id_open_key" ON "bed_assignments" ("bed_id") WHERE "ended_at" IS NULL;

-- A patient is in at most one bed at a time, which is the same statement as
-- being in at most one open admission. Enforced here rather than in the service
-- for the same reason as above: a duplicate admit must fail on a constraint,
-- not on a check that raced.
CREATE UNIQUE INDEX "admissions_patient_id_admitted_key" ON "admissions" ("patient_id") WHERE "status" = 'ADMITTED' AND "deleted_at" IS NULL;

-- A stay cannot end before it started, and neither can a bed assignment.
-- Rejects clock skew and hand-edited rows, not clinically odd ones: a
-- same-instant admit and discharge is a legitimate correction and stays valid.
ALTER TABLE "admissions"
  ADD CONSTRAINT "admissions_discharged_after_admitted_check"
  CHECK ("discharged_at" IS NULL OR "discharged_at" >= "admitted_at");

ALTER TABLE "bed_assignments"
  ADD CONSTRAINT "bed_assignments_ended_after_started_check"
  CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at");
