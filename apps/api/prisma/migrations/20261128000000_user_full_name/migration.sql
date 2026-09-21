-- P20-T05 (SJ-202): one name per human account, on the account itself (D-027).
--
-- Nullable, and it stays nullable. Every row that exists predates this column
-- and nobody may be locked out of an account for want of a name that was never
-- asked for — D-026's completion gate is doctor-only and must not grow a
-- second, quieter member.

ALTER TABLE "users" ADD COLUMN "full_name" TEXT;

-- Backfill from the doctor profile the account owns, where there is one. This
-- is the whole reason `DoctorProfile.fullName` is demoted rather than dropped:
-- for a doctor the name already exists and is correct, so asking again would
-- be asking a question that has been answered.
UPDATE "users"
SET "full_name" = "doctor_profiles"."full_name"
FROM "doctor_profiles"
WHERE "doctor_profiles"."owner_user_id" = "users"."id"
  AND "doctor_profiles"."deleted_at" IS NULL
  AND "users"."full_name" IS NULL;

-- The name an administrator typed when inviting somebody, carried from the
-- invitation to the account the accept creates.
--
-- On the invitation rather than resolved at accept time because there is no
-- other place to put it: no `User` row exists until someone accepts, and a
-- doctor invitation reaches its name through `doctor_profile_id` instead, so
-- this column is null on those.
ALTER TABLE "user_invitations" ADD COLUMN "full_name" TEXT;
