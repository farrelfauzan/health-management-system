-- CreateTable
CREATE TABLE "specialties" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "specialties_name_key" ON "specialties"("name");

-- CreateIndex
CREATE INDEX "specialties_deleted_at_idx" ON "specialties"("deleted_at");

-- CreateIndex
CREATE INDEX "specialties_is_active_idx" ON "specialties"("is_active");

-- Backfill: create one specialty row per distinct free-text value currently on doctors
INSERT INTO "specialties" ("id", "name", "created_at", "updated_at")
SELECT DISTINCT ON (lower(trim("specialty")))
    md5('specialty:' || lower(trim("specialty")))::uuid,
    trim("specialty"),
    NOW(),
    NOW()
FROM "doctor_profiles"
WHERE trim("specialty") <> ''
ON CONFLICT ("name") DO NOTHING;

-- Fallback specialty for doctors whose free-text value was blank
INSERT INTO "specialties" ("id", "name", "created_at", "updated_at")
VALUES (md5('specialty:general practice')::uuid, 'General Practice', NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;

-- AlterTable: add the FK column, map every doctor to its specialty row, then enforce NOT NULL
ALTER TABLE "doctor_profiles" ADD COLUMN "specialty_id" UUID;

UPDATE "doctor_profiles" AS dp
SET "specialty_id" = s."id"
FROM "specialties" AS s
WHERE lower(trim(dp."specialty")) = lower(s."name");

UPDATE "doctor_profiles"
SET "specialty_id" = (SELECT "id" FROM "specialties" WHERE lower("name") = 'general practice')
WHERE "specialty_id" IS NULL;

ALTER TABLE "doctor_profiles" ALTER COLUMN "specialty_id" SET NOT NULL;

-- DropColumn: the free-text value is now normalised into "specialties"
ALTER TABLE "doctor_profiles" DROP COLUMN "specialty";

-- CreateIndex
CREATE INDEX "doctor_profiles_specialty_id_idx" ON "doctor_profiles"("specialty_id");

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
