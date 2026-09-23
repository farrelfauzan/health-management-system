import type { PortalShellValue } from '#rbac/types';

/**
 * Which shell each `portal.*` key opens (IMP-3). `proxy.ts` gates navigation
 * on these keys; a role holding none of them signs in and is sent straight
 * back to the login page, with no message (P22-T04). Held more than one, the
 * admin shell wins.
 */
export const PORTAL_SHELL_BY_PERMISSION_KEY: Readonly<Record<string, PortalShellValue>> = {
  'portal.admin-access:any': 'ADMIN',
  'portal.doctor-access:any': 'DOCTOR',
  'portal.patient-access:own': 'PATIENT',
};
