import { resolveUserFullName } from '#admin-management/resolve-user-full-name';

/**
 * The name to print for a clinician recorded by their doctor profile — the
 * immunization performer and the lab-order requester (P20-T07).
 *
 * Those rows point at a `DoctorProfile`, not at an account, so they read the
 * profile's own name and nothing else. D-027 makes the account the identity of
 * record: once a profile has an owning account, the account's name wins and
 * the profile's is only the fallback for a doctor who has not signed in yet.
 * This routes both through {@link resolveUserFullName} so the performer line
 * on a vaccination and the doctor line on the account agree.
 *
 * Null when neither holds a name. There is no email to fall back to here: a
 * profile without an account has no sign-in address, and an address is not
 * something to print on a clinical record anyway.
 */
export function resolveClinicianName(profile: {
  fullName: string | null;
  ownerUser?: { fullName: string | null } | null;
}): string | null {
  return resolveUserFullName({
    fullName: profile.ownerUser?.fullName,
    doctorProfile: { fullName: profile.fullName },
  });
}
