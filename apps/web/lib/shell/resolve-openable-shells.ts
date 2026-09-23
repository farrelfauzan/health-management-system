import type { PortalShellValue } from '@hms/shared-types';

import { hasAnyRole, hasPermission, type AccessTokenClaims } from '#lib/auth/access-token-claims';

/**
 * The shells a session may open, admin first (P22-T05). Read from the
 * `portal.*` claims (IMP-3), with the seeded role codes as the fallback for
 * sessions minted before those keys existed — the same inputs `proxy.ts` has
 * always used.
 *
 * SUPER_ADMIN gets the admin shell only. Its catalogue-wide union includes
 * every portal key, so without this it would be offered a doctor shell with no
 * doctor profile behind it and a patient portal with no patient.
 *
 * Navigation only: the API's guard decides every call made from any shell.
 */
export function resolveOpenableShells(claims: AccessTokenClaims | null): PortalShellValue[] {
  if (claims === null) {
    return [];
  }
  const canOpenAdmin =
    hasPermission(claims, 'portal.admin-access:any') ||
    hasAnyRole(claims, ['SUPER_ADMIN', 'ADMIN']);
  if (hasAnyRole(claims, ['SUPER_ADMIN'])) {
    return ['ADMIN'];
  }
  const canOpenDoctor =
    hasPermission(claims, 'portal.doctor-access:any') || hasAnyRole(claims, ['DOCTOR', 'MIDWIFE']);
  const canOpenPatient =
    hasPermission(claims, 'portal.patient-access:own') || hasAnyRole(claims, ['PATIENT']);
  return [
    ...(canOpenAdmin ? (['ADMIN'] as const) : []),
    ...(canOpenDoctor ? (['DOCTOR'] as const) : []),
    ...(canOpenPatient ? (['PATIENT'] as const) : []),
  ];
}
