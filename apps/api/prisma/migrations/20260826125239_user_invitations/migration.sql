-- Email invitations for staff users (IMP-23). Replaces the flow where an
-- administrator typed the new user's password into a form and then had to
-- transmit it out of band: the admin now supplies an address and roles, and
-- the only person who ever knows the password is the person who chose it.
--
-- `user_invitations` is `refresh_tokens` in a different hat — a bearer secret
-- stored only as a SHA-256, presentable once, revocable at any moment, with
-- `consumed_at` and `revoked_at` kept apart so "already used" and "withdrawn"
-- stay distinguishable after the fact. `role_codes` is a plain text[] because
-- the grant is not live until acceptance; writing `user_roles` rows at invite
-- time would be a real permission grant to an account that cannot log in.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'USER_INVITED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_INVITE_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_INVITE_REVOKED';

-- CreateTable
CREATE TABLE "user_invitations" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "role_codes" TEXT[],
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_token_hash_key" ON "user_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "user_invitations_email_idx" ON "user_invitations"("email");

-- CreateIndex
CREATE INDEX "user_invitations_expires_at_idx" ON "user_invitations"("expires_at");

-- CreateIndex
CREATE INDEX "user_invitations_consumed_at_idx" ON "user_invitations"("consumed_at");

-- CreateIndex
CREATE INDEX "user_invitations_revoked_at_idx" ON "user_invitations"("revoked_at");

-- CreateIndex
CREATE INDEX "user_invitations_invited_by_id_idx" ON "user_invitations"("invited_by_id");

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
