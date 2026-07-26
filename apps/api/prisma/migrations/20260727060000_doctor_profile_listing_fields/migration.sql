-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN "title" TEXT;
ALTER TABLE "doctor_profiles" ADD COLUMN "degrees" TEXT;
ALTER TABLE "doctor_profiles" ADD COLUMN "email" TEXT;

-- CreateTable
CREATE TABLE "doctor_educations" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "field_of_study" TEXT,
    "graduation_year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "doctor_educations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_educations_doctor_id_idx" ON "doctor_educations"("doctor_id");

-- CreateIndex
CREATE INDEX "doctor_educations_deleted_at_idx" ON "doctor_educations"("deleted_at");

-- AddForeignKey
ALTER TABLE "doctor_educations" ADD CONSTRAINT "doctor_educations_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
