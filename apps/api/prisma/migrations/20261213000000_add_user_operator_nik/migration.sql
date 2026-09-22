-- P24-T15 (SJ-214, D-039): the operator's own NIK on the account, stored the
-- way every other national identifier in this schema is — ciphertext, unique
-- blind index, last four digits, key version. Nullable throughout: no
-- existing account has one, and none is required to keep working.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "nik_ciphertext" TEXT,
ADD COLUMN     "nik_index" TEXT,
ADD COLUMN     "nik_key_version" SMALLINT,
ADD COLUMN     "nik_last4" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_nik_index_key" ON "users"("nik_index");
