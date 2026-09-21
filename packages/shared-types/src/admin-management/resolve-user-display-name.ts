import { resolveUserFullName } from '#admin-management/resolve-user-full-name';

/**
 * The name to show for a human account (D-027, P20-T06), in the order D-027
 * fixed: the account's own name, then the pre-account doctor profile's, then
 * the sign-in address for an account nobody has named.
 *
 * Every display site asks this rather than writing its own
 * `doctorProfile?.fullName ?? user.email`. The copies had already drifted: the
 * administration users table showed the email while the organisation roster
 * showed the doctor's name for the same person, and a lab technician signed
 * released results with `lab1@klinik.id` in bold.
 *
 * Never blank — see {@link resolveUserFullName} for why an empty name falls
 * through.
 */
export function resolveUserDisplayName(user: {
  fullName?: string | null;
  doctorProfile?: { fullName: string | null } | null;
  email: string;
}): string {
  return resolveUserFullName(user) ?? user.email;
}
