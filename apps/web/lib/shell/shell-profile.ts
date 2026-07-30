import type { AccessTokenClaims } from '#lib/auth/access-token-claims';

export type ShellProfile = {
  displayName: string;
  isFallbackName?: boolean;
  roleLabel: string;
  roleKey?: 'superAdmin' | 'admin' | 'doctor' | 'pharmacist' | 'patient' | 'staff' | null;
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

export function resolveShellProfile(claims: AccessTokenClaims | null): ShellProfile {
  if (!claims) {
    return FALLBACK_PROFILE;
  }
  const emailLocalPart = claims.email?.split('@')[0] ?? '';
  const displayName = emailLocalPart
    ? formatTitleCase(emailLocalPart)
    : FALLBACK_PROFILE.displayName;
  const primaryRole = claims.roles?.[0] ?? claims.role ?? '';
  const roleLabel = primaryRole ? formatTitleCase(primaryRole) : FALLBACK_PROFILE.roleLabel;
  const roleKey = resolveRoleKey(primaryRole);
  return {
    displayName,
    isFallbackName: !emailLocalPart,
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
    PHARMACIST: 'pharmacist',
    PATIENT: 'patient',
  };
  return roleKeys[role.toUpperCase()] ?? (role ? null : 'staff');
}
