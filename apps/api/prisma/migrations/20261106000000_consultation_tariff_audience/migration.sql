-- Consultation fees priced by the visit rather than by the clinic (P26-T01).
--
-- Until now a CONSULTATION tariff addressed nobody: generation took the one
-- active row whatever the visit was, so a bidan's patient and a specialist's
-- patient were billed the same "Konsultasi Dokter Umum", and a clinic that
-- priced the two apart got a 400 with no way to answer it. A consultation
-- tariff now names the audience it prices -- the poli, the profession, or
-- both -- and generation reads that audience off the clinician who actually
-- held the encounter.

-- AlterTable
ALTER TABLE "service_tariffs"
  ADD COLUMN "specialty_id" UUID,
  ADD COLUMN "profession" "clinician_profession";

-- CreateIndex
CREATE INDEX "service_tariffs_specialty_id_idx" ON "service_tariffs"("specialty_id");

-- AddForeignKey
ALTER TABLE "service_tariffs" ADD CONSTRAINT "service_tariffs_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Both columns address a consultation and nothing else. A lab tariff carrying
-- a poli would be a field that means something on one row and nothing on the
-- next, which is the same reasoning as `service_tariffs_room_class_category_check`.
ALTER TABLE "service_tariffs"
  ADD CONSTRAINT "service_tariffs_consultation_audience_check"
  CHECK (
    "category" = 'CONSULTATION'
    OR ("specialty_id" IS NULL AND "profession" IS NULL)
  );

-- One live consultation price per audience: with two, generation would have to
-- guess, and a visit billed at the wrong one of two consultation fees is not a
-- rounding error. Three indexes rather than one over a COALESCE pair, because
-- an enum-to-text cast is not IMMUTABLE and Postgres refuses it in an index
-- expression; each index covers one shape of a tagged audience.
--
-- Deliberately scoped to rows that name an audience. Clinics that already
-- carry several untagged consultation tariffs -- the very state that produced
-- the 400 this migration removes -- must not have their deploy fail; their
-- rows stay as they are, generation reports them as an ambiguous fallback, and
-- tagging one with a poli resolves it. The untagged fee is kept unique by the
-- API instead.
CREATE UNIQUE INDEX "service_tariffs_consultation_audience_poli_profession_live_key"
  ON "service_tariffs" ("specialty_id", "profession")
  WHERE "category" = 'CONSULTATION'
    AND "deleted_at" IS NULL
    AND "specialty_id" IS NOT NULL
    AND "profession" IS NOT NULL;

CREATE UNIQUE INDEX "service_tariffs_consultation_audience_poli_live_key"
  ON "service_tariffs" ("specialty_id")
  WHERE "category" = 'CONSULTATION'
    AND "deleted_at" IS NULL
    AND "specialty_id" IS NOT NULL
    AND "profession" IS NULL;

CREATE UNIQUE INDEX "service_tariffs_consultation_audience_profession_live_key"
  ON "service_tariffs" ("profession")
  WHERE "category" = 'CONSULTATION'
    AND "deleted_at" IS NULL
    AND "specialty_id" IS NULL
    AND "profession" IS NOT NULL;
