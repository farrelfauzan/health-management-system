import type { AccessTokenClaims } from '#lib/auth/access-token-claims';

export type ShellProfile = {
  displayName: string;
  /**
   * The display name is not a person's name (P20-T08): nothing names this
   * account, so `displayName` is its email address verbatim — or, with no
   * address either, an untranslated placeholder the menu swaps for its own
   * copy. Consumers use it to avoid printing the address twice, never to
   * invent a name.
   */
  isFallbackName: boolean;
  roleLabel: string;
  roleKey?:
    'superAdmin' | 'admin' | 'doctor' | 'midwife' | 'pharmacist' | 'patient' | 'staff' | null;
  email: string;
};

const FALLBACK_PROFILE: ShellProfile = {
  displayName: 'MetaKlinik User',
  isFallbackName: true,
  roleLabel: 'Staff',
  roleKey: 'staff',
  email: '',
};

function formatTitleCase(value: string): string {
  return value
    .trim()
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Who the shell says you are.
 *
 * The name is the session's `name` claim (P20-T08) — the account's own name,
 * else the doctor or patient record's, resolved by the API at issuance and
 * carried by both the access token and the session hint. It is used verbatim:
 * a real name is not ours to re-case, and title-casing would turn "Siti
 * Nurhaliza binti Abdullah" into something nobody signs.
 *
 * With no name — an account nobody has named yet, or a session issued before
 * the claim existed, until its next refresh — the shell shows the email
 * address exactly as it is. It used to title-case the local part instead, so
 * `apotek1@klinik.id` was greeted as "Apotek1" with an "A" avatar: a name
 * nobody chose, presented as if somebody had. `isFallbackName` says which of
 * the two the display name is.
 *
 * The role line underneath is the same idea: a clinician's own profile says
 * whether they are a doctor or a midwife, and that is what it shows; the role
 * code on the account only answers for everyone who has no clinician profile.
 */
export function resolveShellProfile(claims: AccessTokenClaims | null): ShellProfile {
  if (!claims) {
    return FALLBACK_PROFILE;
  }
  const fullName = claims.name?.trim() ?? '';
  const email = claims.email?.trim() ?? '';
  // A clinician is labelled by what their own profile says they are, and only
  // then by the role code on their account. The two drift apart legitimately:
  // an administrator correcting a profession from MIDWIFE to DOCTOR does not
  // re-grant roles — role assignment is its own deliberate act — so reading
  // the label off the role greeted a doctor as "Bidan" indefinitely.
  const primaryRole = claims.clinicianProfession ?? claims.roles?.[0] ?? claims.role ?? '';
  const roleLabel = primaryRole ? formatTitleCase(primaryRole) : FALLBACK_PROFILE.roleLabel;
  const roleKey = resolveRoleKey(primaryRole);
  return {
    displayName: fullName || email || FALLBACK_PROFILE.displayName,
    isFallbackName: !fullName,
    roleLabel,
    roleKey,
    email,
  };
}

function resolveRoleKey(role: string): ShellProfile['roleKey'] {
  const roleKeys: Record<string, NonNullable<ShellProfile['roleKey']>> = {
    SUPER_ADMIN: 'superAdmin',
    ADMIN: 'admin',
    DOCTOR: 'doctor',
    MIDWIFE: 'midwife',
    PHARMACIST: 'pharmacist',
    PATIENT: 'patient',
  };
  return roleKeys[role.toUpperCase()] ?? (role ? null : 'staff');
}
