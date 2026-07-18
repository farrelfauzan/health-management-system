-- CreateEnum
CREATE TYPE "DoctorPatientActivityAction" AS ENUM ('ASSIGNED', 'UNASSIGNED');

-- CreateTable
CREATE TABLE "doctor_profiles" (
    "id" UUID NOT NULL,
    "license_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "owner_user_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "doctor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_patients" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_by_id" UUID,
    "unassigned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_patient_activities" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "action" "DoctorPatientActivityAction" NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_patient_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_license_number_key" ON "doctor_profiles"("license_number");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_owner_user_id_key" ON "doctor_profiles"("owner_user_id");

-- CreateIndex
CREATE INDEX "doctor_profiles_deleted_at_idx" ON "doctor_profiles"("deleted_at");

-- CreateIndex
CREATE INDEX "doctor_profiles_is_active_idx" ON "doctor_profiles"("is_active");

-- CreateIndex
CREATE INDEX "doctor_profiles_full_name_idx" ON "doctor_profiles"("full_name");

-- CreateIndex
CREATE INDEX "doctor_patients_doctor_id_unassigned_at_idx" ON "doctor_patients"("doctor_id", "unassigned_at");

-- CreateIndex
CREATE INDEX "doctor_patients_patient_id_unassigned_at_idx" ON "doctor_patients"("patient_id", "unassigned_at");

-- CreateIndex
CREATE INDEX "doctor_patients_assigned_by_id_idx" ON "doctor_patients"("assigned_by_id");

-- CreateIndex
CREATE INDEX "doctor_patients_unassigned_by_id_idx" ON "doctor_patients"("unassigned_by_id");

-- CreateIndex
CREATE INDEX "doctor_patients_assigned_at_idx" ON "doctor_patients"("assigned_at");

-- CreateIndex
CREATE INDEX "doctor_patients_unassigned_at_idx" ON "doctor_patients"("unassigned_at");

-- CreateIndex
CREATE INDEX "doctor_patient_activities_assignment_id_occurred_at_idx" ON "doctor_patient_activities"("assignment_id", "occurred_at");

-- CreateIndex
CREATE INDEX "doctor_patient_activities_actor_user_id_occurred_at_idx" ON "doctor_patient_activities"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "doctor_patient_activities_action_occurred_at_idx" ON "doctor_patient_activities"("action", "occurred_at");

-- CreateIndex
CREATE INDEX "doctor_patient_activities_occurred_at_idx" ON "doctor_patient_activities"("occurred_at");

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patients" ADD CONSTRAINT "doctor_patients_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patients" ADD CONSTRAINT "doctor_patients_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patients" ADD CONSTRAINT "doctor_patients_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patients" ADD CONSTRAINT "doctor_patients_unassigned_by_id_fkey" FOREIGN KEY ("unassigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patient_activities" ADD CONSTRAINT "doctor_patient_activities_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "doctor_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patient_activities" ADD CONSTRAINT "doctor_patient_activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex (partial unique): only one active assignment per doctor-patient pair while retaining unassigned history rows
CREATE UNIQUE INDEX "doctor_patients_active_pair_key" ON "doctor_patients"("doctor_id", "patient_id") WHERE "unassigned_at" IS NULL;
