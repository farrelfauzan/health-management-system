-- A doctor's email lived on both `users` and `doctor_profiles`. Two copies of
-- one address drift the moment it changes in one place, and the account
-- address is the one that must be correct — it is what the doctor signs in
-- with. `doctor_profiles.email` is therefore dropped and the value is read
-- through the linked user account.
--
-- Carry the profile address over first, so a doctor whose account has no
-- address (or who has no account yet) does not silently lose it. Profiles
-- with no linked account keep nothing: without a user row there is nowhere to
-- put an address, which is the point of the change.
UPDATE "users" AS u
SET
  "email" = d."email",
  "updated_at" = NOW()
FROM "doctor_profiles" AS d
WHERE d."owner_user_id" = u."id"
  AND d."email" IS NOT NULL
  AND d."email" <> ''
  AND u."email" IS DISTINCT FROM d."email"
  -- Never overwrite an address already taken by a different account.
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS other
    WHERE other."email" = d."email"
      AND other."id" <> u."id"
  );

ALTER TABLE "doctor_profiles" DROP COLUMN "email";
