-- CreateTable
CREATE TABLE "queue_counters" (
    "queue_date" DATE NOT NULL,
    "next_value" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_counters_pkey" PRIMARY KEY ("queue_date")
);

-- AlterTable
-- Existing registrations keep NULL: they predate the daily queue, and
-- back-numbering them from UTC timestamps would fabricate an order the front
-- desk never called. NULLs are distinct under the unique index, so legacy
-- rows never collide with allocated tickets.
ALTER TABLE "registrations" ADD COLUMN "queue_number" INTEGER,
ADD COLUMN "queue_date" DATE;

-- CreateIndex
CREATE UNIQUE INDEX "registrations_queue_date_queue_number_key" ON "registrations"("queue_date", "queue_number");
