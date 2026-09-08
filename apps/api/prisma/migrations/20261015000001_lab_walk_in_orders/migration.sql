-- P18-T10 (SJ-149): a lab order that belongs to a visit rather than to a visit
-- with a doctor in it.
--
-- Patients arrive with a request letter from an outside doctor, or ask for a
-- check-up panel with no consultation. Forcing an encounter for those would
-- put a doctor visit in the record that never happened — and, once P18-T09
-- reports it, a national Encounter naming an attending practitioner who never
-- saw the patient. `Encounter.doctor_id` is NOT NULL, so there is no honest
-- minimal encounter to write locally: the visit is the registration, and the
-- order hangs off that instead.

-- AlterTable
-- What a visit is for. LAB_ONLY takes no poli queue number: there is no poli.
ALTER TABLE "registrations"
    ADD COLUMN "type" "registration_type" NOT NULL DEFAULT 'CONSULTATION';

-- AlterTable
ALTER TABLE "lab_orders"
    ADD COLUMN "source" "lab_order_source" NOT NULL DEFAULT 'ENCOUNTER',
    -- The visit this order belongs to, denormalised onto the order exactly as
    -- `patient_id` already is. It is the one key every order has, whichever
    -- way the request arrived, so the worklist and the bill both read it
    -- rather than branching on whether an encounter exists.
    ADD COLUMN "registration_id" UUID,
    -- Who asked, when it was not a doctor of this clinic. Free text: a klinik
    -- pratama receives letters from whichever practice sent the patient, and a
    -- directory of outside doctors is not this ticket. Distinct from
    -- `external_facility_name`, which P18-T11 uses for the lab we send work
    -- *out* to — the two externals point in opposite directions.
    ADD COLUMN "external_requester_name" TEXT,
    ADD COLUMN "external_requester_facility" TEXT,
    -- The surat pengantar the patient handed over, filed as their document
    -- (category REFERRAL_LETTER). `SetNull` because purging a document must
    -- never take the order with it, matching `request_document_id`.
    ADD COLUMN "request_letter_document_id" UUID;

-- Backfill: every existing order came from an encounter, and every encounter
-- has a registration. Done before the column is constrained so the CHECK below
-- can be trusted from the moment it exists.
UPDATE "lab_orders" AS "o"
SET "registration_id" = "e"."registration_id"
FROM "encounters" AS "e"
WHERE "e"."id" = "o"."encounter_id";

ALTER TABLE "lab_orders" ALTER COLUMN "registration_id" SET NOT NULL;

-- An order from outside has no encounter, and one from a consultation has no
-- outside requester.
ALTER TABLE "lab_orders" ALTER COLUMN "encounter_id" DROP NOT NULL;

-- And no ordering doctor of this clinic. Nullable rather than pointed at a
-- placeholder profile: a fabricated requester is the thing this ticket exists
-- to avoid, and every read of it already has to handle a doctor who has since
-- been soft-deleted.
ALTER TABLE "lab_orders" ALTER COLUMN "ordered_by_id" DROP NOT NULL;

-- Each source carries exactly the keys it is about. Without this a WALK_IN row
-- could keep an encounter and be reported as a consultation that never
-- happened, which is the whole failure this ticket is about.
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_source_keys_check" CHECK (
    (
        "source" = 'ENCOUNTER'
        AND "encounter_id" IS NOT NULL
        AND "ordered_by_id" IS NOT NULL
        AND "external_requester_name" IS NULL
    )
    OR (
        "source" = 'WALK_IN'
        AND "encounter_id" IS NULL
        AND "external_requester_name" IS NULL
    )
    OR (
        -- A referral with no requester named is a letter nobody signed: the
        -- report has to say who asked, and the patient has to be told.
        "source" = 'EXTERNAL_REFERRAL'
        AND "encounter_id" IS NULL
        AND "external_requester_name" IS NOT NULL
    )
);

-- CreateIndex
CREATE INDEX "lab_orders_registration_id_idx" ON "lab_orders"("registration_id");
CREATE INDEX "lab_orders_source_ordered_at_idx" ON "lab_orders"("source", "ordered_at");

-- One letter per order, as `request_document_id` is one printed request per
-- order.
CREATE UNIQUE INDEX "lab_orders_request_letter_document_id_key"
    ON "lab_orders"("request_letter_document_id");

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_registration_id_fkey"
    FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_request_letter_document_id_fkey"
    FOREIGN KEY ("request_letter_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
-- A third kind of episode to bill. A LAB_ONLY visit has neither an encounter
-- nor a stay, but it still owes money for the panel that was run.
ALTER TABLE "invoices" ADD COLUMN "registration_id" UUID;

-- An invoice still bills exactly one episode of care — now chosen from three.
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_one_episode_check";
ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_one_episode_check"
    CHECK (
        ("encounter_id" IS NOT NULL)::int
        + ("admission_id" IS NOT NULL)::int
        + ("registration_id" IS NOT NULL)::int
        = 1
    );

-- CreateIndex
CREATE INDEX "invoices_registration_id_idx" ON "invoices"("registration_id");

-- The `invoices_encounter_id_live_key` rule, restated for walk-in visits: at
-- most one live invoice per registration, with voided ones free to accumulate.
CREATE UNIQUE INDEX "invoices_registration_id_live_key"
    ON "invoices" ("registration_id")
    WHERE "status" <> 'VOID' AND "deleted_at" IS NULL;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_registration_id_fkey"
    FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
