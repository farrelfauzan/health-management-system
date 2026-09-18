import type { AccessTokenClaims } from '#lib/auth/access-token-claims';

export type ShellProfile = {
  displayName: string;
  isFallbackName?: boolean;
  roleLabel: string;
  roleKey?: 'superAdmin' | 'admin' | 'doctor' | 'midwife' | 'pharmacist' | 'patient' | 'staff' | null;
  email: string;
};

const FALLBACK_PROFILE: ShellProfile = {
  displayName: 'Saling Jaga User',
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
 * The name comes from the person's own record when the session carries one —
 * their doctor or patient profile, written into the session hint by the API —
 * because that is the name they wrote down and the name colleagues call them
 * by. It is used verbatim: a real name is not ours to re-case, and title-casing
 * would turn "Siti Nurhaliza binti Abdullah" into something nobody signs.
 *
 * The role line underneath is the same idea: a clinician's own profile says
 * whether they are a doctor or a midwife, and that is what it shows; the role
 * code on the account only answers for everyone who has no clinician profile.
 *
 * The email address is the fallback, not the source. An account no clinical
 * record names — a receptionist, an administrator — still has to be greeted as
 * something, and the local part title-cased is the best guess available. Only
 * when there is no address either does `isFallbackName` go up, which is the
 * menu's cue to render a translated placeholder instead of a name at all.
 */
export function resolveShellProfile(claims: AccessTokenClaims | null): ShellProfile {
  if (!claims) {
    return FALLBACK_PROFILE;
  }
  const fullName = claims.name?.trim() ?? '';
  const emailLocalPart = claims.email?.split('@')[0] ?? '';
  const displayName =
    fullName || (emailLocalPart ? formatTitleCase(emailLocalPart) : FALLBACK_PROFILE.displayName);
  // A clinician is labelled by what their own profile says they are, and only
  // then by the role code on their account. The two drift apart legitimately:
  // an administrator correcting a profession from MIDWIFE to DOCTOR does not
  // re-grant roles — role assignment is its own deliberate act — so reading
  // the label off the role greeted a doctor as "Bidan" indefinitely.
  const primaryRole = claims.clinicianProfession ?? claims.roles?.[0] ?? claims.role ?? '';
  const roleLabel = primaryRole ? formatTitleCase(primaryRole) : FALLBACK_PROFILE.roleLabel;
  const roleKey = resolveRoleKey(primaryRole);
  return {
    displayName,
    isFallbackName: !fullName && !emailLocalPart,
    roleLabel,
    roleKey,
    email: claims.email ?? '',
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
