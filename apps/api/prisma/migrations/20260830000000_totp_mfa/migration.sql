-- SJ-8: TOTP multi-factor authentication for privileged accounts.
--
-- Two tables and five audit verbs. The asymmetry worth noting up front: the
-- TOTP secret is *encrypted* while recovery codes are *hashed*. TOTP is
-- symmetric — the server recomputes the same HMAC the phone does, so it must
-- be able to read the secret back. A recovery code only ever has to be
-- recognised, so nothing reversible is stored.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'MFA_ENROLLED';
ALTER TYPE "AuditAction" ADD VALUE 'MFA_CHALLENGE_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'MFA_RECOVERY_USED';
ALTER TYPE "AuditAction" ADD VALUE 'MFA_RECOVERY_REGENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'MFA_RESET';

-- CreateTable
CREATE TABLE "mfa_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    -- Null until the user returns a current code. Enforcement keys off this
    -- column, so an abandoned enrolment can never lock anybody out.
    "verified_at" TIMESTAMP(3),
    -- The RFC 6238 counter of the last accepted code. Codes stay valid for a
    -- whole 30-second step; recording the step is what makes each one
    -- single-use rather than replayable for the rest of its window.
    "last_accepted_time_step" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mfa_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    -- Spent codes are kept, not deleted: "this code was used at 03:14" is the
    -- question asked after a suspected compromise, and a deleted row is silent.
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mfa_credentials_user_id_key" ON "mfa_credentials"("user_id");
CREATE INDEX "mfa_credentials_verified_at_idx" ON "mfa_credentials"("verified_at");
CREATE UNIQUE INDEX "mfa_recovery_codes_code_hash_key" ON "mfa_recovery_codes"("code_hash");
CREATE INDEX "mfa_recovery_codes_user_id_used_at_idx" ON "mfa_recovery_codes"("user_id", "used_at");

-- AddForeignKey
ALTER TABLE "mfa_credentials" ADD CONSTRAINT "mfa_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
