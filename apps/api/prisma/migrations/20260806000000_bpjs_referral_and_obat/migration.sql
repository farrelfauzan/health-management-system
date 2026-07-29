-- AlterEnum
ALTER TYPE "BpjsSubmissionType" ADD VALUE 'OBAT';

-- CreateTable
CREATE TABLE "bpjs_referrals" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "destination_provider_code" TEXT NOT NULL,
    "sub_specialty_code" TEXT,
    "sarana_code" TEXT,
    "khusus_code" TEXT,
    "estimated_referral_date" DATE NOT NULL,
    "notes" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bpjs_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bpjs_referrals_encounter_id_key" ON "bpjs_referrals"("encounter_id");

-- CreateIndex
CREATE INDEX "bpjs_referrals_deleted_at_idx" ON "bpjs_referrals"("deleted_at");

-- AddForeignKey
ALTER TABLE "bpjs_referrals" ADD CONSTRAINT "bpjs_referrals_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bpjs_referrals" ADD CONSTRAINT "bpjs_referrals_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
