-- P18-T09 (SJ-86): a second producer for the SATUSEHAT outbox.
--
-- Results are released after the visit has closed, so a lab report cannot ride
-- the encounter's row: by the time the analis signs, that row is SUBMITTED and
-- settled. The lab chain therefore gets rows of its own, keyed on the order
-- rather than the encounter, and gated on the encounter row having landed —
-- the DiagnosticReport has to reference a real Encounter/{ihs}.

-- AlterTable
-- Defaulted to ENCOUNTER so every row written before this migration keeps
-- exactly the meaning it had.
ALTER TABLE "satusehat_submissions"
    ADD COLUMN "kind" "satusehat_submission_kind" NOT NULL DEFAULT 'ENCOUNTER',
    ADD COLUMN "lab_order_id" UUID;

-- A LAB_REPORT row has no encounter of its own: the encounter it must wait for
-- is reached through the order, which is also where P18-T10 will allow there to
-- be none at all. Dropping NOT NULL is what lets the column mean "this row IS
-- the encounter's" rather than "this row mentions an encounter".
ALTER TABLE "satusehat_submissions" ALTER COLUMN "encounter_id" DROP NOT NULL;

-- DropIndex
-- One outbox row per encounter was the whole uniqueness rule while ENCOUNTER
-- was the only kind. It now has to be stated per kind.
DROP INDEX "satusehat_submissions_encounter_id_key";

-- CreateIndex
-- Still one ENCOUNTER row per encounter — the property `encounter.close`
-- relies on to stay idempotent.
CREATE UNIQUE INDEX "satusehat_submissions_encounter_kind_key"
    ON "satusehat_submissions"("encounter_id")
    WHERE "kind" = 'ENCOUNTER';

-- CreateIndex
-- And one *open* LAB_REPORT row per order. Not one row per order outright: an
-- amendment has to be reportable, and it supersedes a report already sent. So
-- a SUBMITTED row drops out of the index and the amendment enqueues beside it,
-- while two live rows for one order — which would post the chain twice — stay
-- impossible. Same shape as `invoices_encounter_id_live_key`.
-- Both indexes are partial, so they live only here: Prisma cannot express a
-- WHERE clause, and its drift check ignores indexes carrying one.
CREATE UNIQUE INDEX "satusehat_submissions_lab_order_open_key"
    ON "satusehat_submissions"("lab_order_id")
    WHERE "kind" = 'LAB_REPORT' AND "status" <> 'SUBMITTED';

-- CreateIndex
-- The partial unique index above covers only the open row. This one answers
-- "everything ever sent for this order" — the release, and every amendment
-- after it — which is what the monitor and the retry surface read.
CREATE INDEX "satusehat_submissions_lab_order_id_idx" ON "satusehat_submissions"("lab_order_id");

-- Each kind carries exactly the key it is about. Without this a LAB_REPORT row
-- with a stray encounter_id would be claimed by the encounter branch and post
-- the wrong bundle.
ALTER TABLE "satusehat_submissions" ADD CONSTRAINT "satusehat_submissions_kind_key_check" CHECK (
    ("kind" = 'ENCOUNTER' AND "encounter_id" IS NOT NULL AND "lab_order_id" IS NULL)
    OR
    ("kind" = 'LAB_REPORT' AND "lab_order_id" IS NOT NULL AND "encounter_id" IS NULL)
);

-- AddForeignKey
-- RESTRICT, as the encounter FK is: an order that has been reported nationally
-- is not deleted out from under its provenance row.
ALTER TABLE "satusehat_submissions" ADD CONSTRAINT "satusehat_submissions_lab_order_id_fkey"
    FOREIGN KEY ("lab_order_id") REFERENCES "lab_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
-- P18-T02 parked this column on the order and left the decision to this
-- ticket: "satusehatServiceRequestId String? // P18-T09 (moved to items if
-- one-per-item)". It is one per item. A ServiceRequest carries the LOINC of a
-- single test, so a request for Darah rutin + GDS is six ServiceRequests, not
-- one — and the id the platform returns belongs to the item that was asked
-- for. The column was never written to, so there is nothing to migrate.
ALTER TABLE "lab_orders" DROP COLUMN "satusehat_service_request_id";

-- The order keeps the id of the one resource that genuinely is per-order: the
-- DiagnosticReport that gathers the whole request into a single sheet.
ALTER TABLE "lab_orders" ADD COLUMN "satusehat_diagnostic_report_id" TEXT;

-- AlterTable
ALTER TABLE "lab_order_items" ADD COLUMN "satusehat_service_request_id" TEXT;
