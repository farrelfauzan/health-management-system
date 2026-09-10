-- P19-T15 (SJ-172): bind an invitation to the doctor profile it was raised for.
--
-- An administrator can now enter a doctor's sign-in address on the create form.
-- No `users` row exists until someone accepts (`password_hash` is NOT NULL), so
-- `doctor_profiles.owner_user_id` cannot be filled at invite time. The binding
-- is carried on the invitation instead and consumed in the accept transaction,
-- which creates the account and links it to this profile in one write.
--
-- ON DELETE SET NULL rather than CASCADE: an invitation records that a link was
-- minted and mailed, and hard-deleting a profile must not erase that evidence.

-- AlterTable
ALTER TABLE "user_invitations" ADD COLUMN     "doctor_profile_id" UUID;

-- CreateIndex
CREATE INDEX "user_invitations_doctor_profile_id_idx" ON "user_invitations"("doctor_profile_id");

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_doctor_profile_id_fkey" FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
