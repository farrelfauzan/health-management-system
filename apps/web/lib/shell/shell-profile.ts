import type { AccessTokenClaims } from '#lib/auth/access-token-claims';

export type ShellProfile = {
  displayName: string;
  roleLabel: string;
};

const FALLBACK_PROFILE: ShellProfile = {
  displayName: 'Saling Jaga User',
  roleLabel: 'Staff',
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
  const displayName = emailLocalPart ? formatTitleCase(emailLocalPart) : FALLBACK_PROFILE.displayName;
  const primaryRole = claims.roles?.[0] ?? claims.role ?? '';
  const roleLabel = primaryRole ? formatTitleCase(primaryRole) : FALLBACK_PROFILE.roleLabel;
  return { displayName, roleLabel };
}
