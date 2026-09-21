/**
 * The person's name, if the record holds one (D-027, P20-T06): the account's
 * own name first, then the name an administrator typed onto a doctor profile
 * before that doctor had an account. Null when neither exists.
 *
 * Deliberately stops short of the email. Some screens need to know whether a
 * person *has* a name — the roster shows the address as a second line only
 * when it is not already standing in for one — so "no name" must stay
 * distinguishable from "a name". Anything that only needs something to print
 * uses {@link resolveUserDisplayName}, which adds the email fallback.
 *
 * A name that is empty or only whitespace counts as absent, so a stray space
 * saved into a form never becomes a blank signature line.
 */
export function resolveUserFullName(user: {
  fullName?: string | null;
  doctorProfile?: { fullName: string | null } | null;
}): string | null {
  return presentOrNull(user.fullName) ?? presentOrNull(user.doctorProfile?.fullName);
}

function presentOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
