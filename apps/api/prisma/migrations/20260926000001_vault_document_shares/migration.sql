-- P16-T34: the share row itself.
--
-- One person's access to one document, created only by that document's owner.
-- This row *is* the relationship that makes OWN resolve for a non-owner — the
-- same way `doctor_patients` makes `encounter.read:own` resolve for a
-- clinician who did not create the encounter. There is no share-all row and
-- no role target: a share names one document and one person, so "share my
-- whole vault" is not something this schema can express.

-- CreateTable
CREATE TABLE "vault_document_shares" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "grantee_id" UUID NOT NULL,
    "granted_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_accessed_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_document_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One share per (document, person). Re-sharing after a revoke updates this
-- row rather than accumulating history: the question the owner asks is "who
-- can open this now", and answering it by folding over revoked rows would be
-- one bug away from answering it wrongly.
CREATE UNIQUE INDEX "vault_document_shares_document_id_grantee_id_key" ON "vault_document_shares"("document_id", "grantee_id");

-- CreateIndex
-- The recipient's "shared with me" list — the only query in this feature that
-- starts from a grantee rather than from a document.
CREATE INDEX "vault_document_shares_grantee_id_revoked_at_idx" ON "vault_document_shares"("grantee_id", "revoked_at");

-- CreateIndex
CREATE INDEX "vault_document_shares_document_id_idx" ON "vault_document_shares"("document_id");

-- CreateIndex
CREATE INDEX "vault_document_shares_granted_by_id_idx" ON "vault_document_shares"("granted_by_id");

-- AddForeignKey
-- Cascade from the document: vault documents are hard-deleted (FR-E3-09), and
-- when the owner deletes one, every key to it goes with it in the same
-- statement rather than leaving rows that grant access to nothing.
ALTER TABLE "vault_document_shares" ADD CONSTRAINT "vault_document_shares_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Cascade from both users. A deleted account must not keep resolving a share
-- in either direction — neither as a recipient who can still open, nor as a
-- grantor whose name the owner panel would have to render as a dangling id.
ALTER TABLE "vault_document_shares" ADD CONSTRAINT "vault_document_shares_grantee_id_fkey" FOREIGN KEY ("grantee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_document_shares" ADD CONSTRAINT "vault_document_shares_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written CHECKs, in the spirit of the vault-column ones above.
--
-- What is *not* here: a constraint that the shared document is a
-- `DOCTOR_VAULT` one. PostgreSQL forbids a subquery in a CHECK, so that rule
-- cannot be a column constraint, and a trigger to enforce it would be a
-- second, silently-diverging copy of a rule the write path already keeps.
-- `VaultDocumentRepository` carries `purpose: 'DOCTOR_VAULT'` as a predicate
-- of every query, including the owner lookup a share write must pass, so a
-- knowledge-base document is never a row the share service holds — see
-- `vault-document-share.database.spec.ts`, which asserts it against a real
-- database rather than a mock.

-- A share to yourself is meaningless — you already have the document — and
-- allowing it would put a row in the owner's own "shared with me" list.
ALTER TABLE "vault_document_shares" ADD CONSTRAINT "vault_document_shares_not_self_check" CHECK ("grantee_id" <> "granted_by_id");

-- An access count cannot be negative, and a row that has never been opened
-- carries no last-opened time. The owner panel renders both directly.
ALTER TABLE "vault_document_shares" ADD CONSTRAINT "vault_document_shares_access_count_check" CHECK ("access_count" >= 0);
ALTER TABLE "vault_document_shares" ADD CONSTRAINT "vault_document_shares_access_consistency_check" CHECK (
  ("access_count" = 0 AND "last_accessed_at" IS NULL) OR ("access_count" > 0 AND "last_accessed_at" IS NOT NULL)
);
