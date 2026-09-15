-- P25-T02, part B: the record of a midwife's delegated authority
-- (kewenangan), shaped by D-036 (docs/post-mvp/decisions.md). It hangs off
-- `doctor_profiles` like `doctor_licenses`, and only a MIDWIFE profile may
-- carry one — the service refuses the rest, because a CHECK cannot see the
-- profession on the parent row.
--
-- Legal basis: PP 28/2024 Pasal 744 and Permenkes 13/2025 Pasal 185–187 for
-- programme and no-other-worker authority; PP 28/2024 Pasal 742(3)–(4) for a
-- competence added through training and written on the STR. Which actions
-- need an authority is still the Permenkes 28/2017 Pasal 25 list, kept as the
-- reference by Permenkes 13/2025 Pasal 305(1).
--
-- The evidence is one of three (`grant_kind`), with its reference and date.
-- The training certificate is always required (PP 28/2024 Pasal 744(4)) and so
-- is an end date: the government sets the period (Pasal 744(8)), so no row is
-- open-ended. The evidence document lives on the row (`grant_document_*`, the
-- way `managed_documents` stores its payload) rather than as a `documents`
-- row: `documents.owner_id` is a user FK and a clinician can exist with no
-- account (NO_ACCOUNT), so there is nobody for such a row to belong to.

-- CreateTable
CREATE TABLE "doctor_authorities" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "kind" "doctor_authority_kind" NOT NULL,
    "grant_kind" "doctor_authority_grant_kind" NOT NULL,
    -- The penetapan number, the penugasan letter number, or the STR number.
    "grant_reference" TEXT NOT NULL,
    "grant_issued_at" DATE NOT NULL,
    "training_certificate_number" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "grant_document_storage_key" TEXT,
    "grant_document_mime_type" TEXT,
    "grant_document_size_bytes" INTEGER,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" UUID,
    "revoke_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "doctor_authorities_pkey" PRIMARY KEY ("id"),
    -- Hand-written; Prisma has no syntax for it and the drift check ignores it.
    CONSTRAINT "doctor_authorities_validity_order_check" CHECK ("valid_until" >= "valid_from")
);

-- CreateTable
-- Which thresholds an authority has been announced at. Mirrors
-- `doctor_license_expiry_notices` and is deliberately not generic: the two
-- sweeps have different audiences and different rows.
CREATE TABLE "doctor_authority_expiry_notices" (
    "id" UUID NOT NULL,
    "authority_id" UUID NOT NULL,
    "threshold_days" INTEGER NOT NULL,
    "notified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_authority_expiry_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_authorities_doctor_id_idx" ON "doctor_authorities"("doctor_id");

-- CreateIndex
CREATE INDEX "doctor_authorities_valid_until_idx" ON "doctor_authorities"("valid_until");

-- CreateIndex
CREATE INDEX "doctor_authorities_deleted_at_idx" ON "doctor_authorities"("deleted_at");

-- CreateIndex
CREATE INDEX "doctor_authorities_created_by_id_idx" ON "doctor_authorities"("created_by_id");

-- CreateIndex
CREATE INDEX "doctor_authorities_revoked_by_id_idx" ON "doctor_authorities"("revoked_by_id");

-- CreateIndex
-- One live authority per kind per clinician. Partial and hand-written: a
-- revoked or soft-deleted row steps aside so the same kind can be granted
-- again, and renewal is an edit of the dates or a revoke-and-regrant. Prisma
-- cannot express a partial unique index and `migrate diff` cannot see it,
-- which is house style (see `doctor_patients_active_pair_key` and the
-- diagnoses index). The service maps the P2002 this raises under a race to the
-- same 409 the pre-check returns.
CREATE UNIQUE INDEX "doctor_authorities_live_kind_key" ON "doctor_authorities"("doctor_id", "kind") WHERE "revoked_at" IS NULL AND "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "doctor_authority_expiry_notices_authority_id_idx" ON "doctor_authority_expiry_notices"("authority_id");

-- CreateIndex
-- One notice per authority per threshold, so a sweep that runs twice in a
-- day tells nobody twice.
CREATE UNIQUE INDEX "doctor_authority_expiry_notices_authority_id_threshold_days_key" ON "doctor_authority_expiry_notices"("authority_id", "threshold_days");

-- AddForeignKey
ALTER TABLE "doctor_authorities" ADD CONSTRAINT "doctor_authorities_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Restrict: the grant names the administrator who recorded it, and that
-- record outlives their account.
ALTER TABLE "doctor_authorities" ADD CONSTRAINT "doctor_authorities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_authorities" ADD CONSTRAINT "doctor_authorities_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- Cascade: the notice is bookkeeping about an authority.
ALTER TABLE "doctor_authority_expiry_notices" ADD CONSTRAINT "doctor_authority_expiry_notices_authority_id_fkey" FOREIGN KEY ("authority_id") REFERENCES "doctor_authorities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
