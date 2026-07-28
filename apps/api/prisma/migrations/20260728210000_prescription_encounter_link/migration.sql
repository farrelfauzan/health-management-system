-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "encounter_id" UUID;

-- CreateIndex
CREATE INDEX "prescriptions_encounter_id_idx" ON "prescriptions"("encounter_id");

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
