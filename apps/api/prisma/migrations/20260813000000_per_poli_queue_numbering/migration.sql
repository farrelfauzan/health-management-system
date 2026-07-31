-- P14-T01: per-poli antrian numbering alongside the clinic-wide ticket roll.
--
-- Additive only. Existing registrations keep a NULL poli number rather than a
-- backfilled one: a queue ticket is a thing that was handed to a patient at a
-- moment in time, and inventing yesterday's per-poli sequence would fabricate
-- tickets nobody was ever called with.

CREATE TABLE "poli_queue_counters" (
    "queue_date" DATE NOT NULL,
    "specialty_id" UUID NOT NULL,
    "next_value" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poli_queue_counters_pkey" PRIMARY KEY ("queue_date", "specialty_id")
);

CREATE INDEX "poli_queue_counters_specialty_id_idx" ON "poli_queue_counters"("specialty_id");

ALTER TABLE "poli_queue_counters" ADD CONSTRAINT "poli_queue_counters_specialty_id_fkey"
    FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "registrations" ADD COLUMN "specialty_id" UUID;
ALTER TABLE "registrations" ADD COLUMN "poli_queue_number" INTEGER;

-- The two columns are set together or not at all: a poli number without the
-- poli it was drawn from cannot be interpreted, and a poli without a number is
-- a ticket that was never issued.
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_poli_queue_pairing_check"
    CHECK (("specialty_id" IS NULL) = ("poli_queue_number" IS NULL));

-- Postgres treats NULLs as distinct in a unique index, so walk-in rows with no
-- poli do not collide with each other.
CREATE UNIQUE INDEX "registrations_queue_date_specialty_id_poli_queue_number_key"
    ON "registrations"("queue_date", "specialty_id", "poli_queue_number");
CREATE INDEX "registrations_queue_date_specialty_id_idx"
    ON "registrations"("queue_date", "specialty_id");

ALTER TABLE "registrations" ADD CONSTRAINT "registrations_specialty_id_fkey"
    FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
