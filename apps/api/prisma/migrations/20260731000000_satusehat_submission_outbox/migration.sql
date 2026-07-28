-- CreateEnum
CREATE TYPE "SatusehatSubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "satusehat_submissions" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "status" "SatusehatSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "satusehat_encounter_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "satusehat_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "satusehat_submissions_encounter_id_key" ON "satusehat_submissions"("encounter_id");

-- CreateIndex
CREATE INDEX "satusehat_submissions_status_next_attempt_at_idx" ON "satusehat_submissions"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "satusehat_submissions" ADD CONSTRAINT "satusehat_submissions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

