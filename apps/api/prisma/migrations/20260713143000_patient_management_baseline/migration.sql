-- CreateTable
CREATE TABLE "patient_profiles" (
    "id" UUID NOT NULL,
    "mrn" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "phone_number" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "owner_user_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_profiles_mrn_key" ON "patient_profiles"("mrn");

-- CreateIndex
CREATE INDEX "patient_profiles_deleted_at_idx" ON "patient_profiles"("deleted_at");

-- CreateIndex
CREATE INDEX "patient_profiles_owner_user_id_idx" ON "patient_profiles"("owner_user_id");

-- CreateIndex
CREATE INDEX "patient_profiles_is_active_idx" ON "patient_profiles"("is_active");

-- CreateIndex
CREATE INDEX "patient_profiles_full_name_idx" ON "patient_profiles"("full_name");

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
