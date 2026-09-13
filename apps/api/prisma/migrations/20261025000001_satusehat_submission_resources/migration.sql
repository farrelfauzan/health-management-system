-- What each SATUSEHAT submission actually sent, and what it left out (P21-T02).
--
-- Until now the outbox row proved a bundle reached the platform and nothing
-- more: `extractCreatedResources` resolved the id SATUSEHAT assigned to every
-- resource in the bundle, the service kept the Encounter id and the allergy
-- ids, and discarded the rest. Nothing could be read back afterwards, and the
-- items dropped for a missing catalog code went to the server log only.
--
-- This table holds **no clinical values** — no codes, names, displays or
-- results. `local_record_id` is the only link back to what an item was, and
-- resolving it needs a doctor's permission (P21-T04). That is what lets the
-- ADMIN-gated integrations monitor render these rows directly without breaking
-- the P10-T06 promise that the outbox carries no clinical payload.
CREATE TABLE "satusehat_submission_resources" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    -- The platform's resource type, as a string rather than an enum: the set
    -- belongs to SATUSEHAT, and adding a bundle entry type should not require a
    -- migration to record it.
    "resource_type" TEXT NOT NULL,
    "outcome" "satusehat_resource_outcome" NOT NULL,
    "skip_reason" "satusehat_resource_skip_reason",
    -- Null on every SKIPPED row, and also on a SENT row whose id could not be
    -- paired out of the transaction response.
    "satusehat_id" TEXT,
    -- Null for resources that exist only in the bundle (the Composition, a
    -- lab-only Encounter) and for backfilled rows whose local record could not
    -- be identified.
    "local_record_id" UUID,
    "is_backfilled" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "satusehat_submission_resources_pkey" PRIMARY KEY ("id")
);

-- The list belongs to its submission and has no meaning without it, so a
-- deleted submission takes its list with it. This is the one place a cascade is
-- deliberate: every other SATUSEHAT relation uses RESTRICT because it links two
-- records that each stand alone.
ALTER TABLE "satusehat_submission_resources"
    ADD CONSTRAINT "satusehat_submission_resources_submission_id_fkey"
    FOREIGN KEY ("submission_id") REFERENCES "satusehat_submissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- A reason belongs to a skip and only to a skip: a SENT row carrying "no KFA
-- code" would be a contradiction the monitor would render as fact.
ALTER TABLE "satusehat_submission_resources"
    ADD CONSTRAINT "satusehat_submission_resources_skip_reason_check"
    CHECK (
        ("outcome" = 'SKIPPED' AND "skip_reason" IS NOT NULL)
        OR ("outcome" = 'SENT' AND "skip_reason" IS NULL)
    );

-- A skipped item was never sent, so it cannot have an id on the platform.
ALTER TABLE "satusehat_submission_resources"
    ADD CONSTRAINT "satusehat_submission_resources_skipped_has_no_id_check"
    CHECK ("outcome" = 'SENT' OR "satusehat_id" IS NULL);

-- The read path is always "the list for this submission".
CREATE INDEX "satusehat_submission_resources_submission_id_idx"
    ON "satusehat_submission_resources"("submission_id");

-- Supports the reverse lookup the backfill needs: given an id the platform
-- returned, is it already recorded?
CREATE INDEX "satusehat_submission_resources_satusehat_id_idx"
    ON "satusehat_submission_resources"("satusehat_id");
