import type { PortalShellValue } from '@hms/shared-types';

/** Where each shell starts (P22-T05); `proxy.ts` refines it per account. */
export const SHELL_HOME_PATH: Readonly<Record<PortalShellValue, string>> = {
  ADMIN: '/admin/dashboard',
  DOCTOR: '/doctor/dashboard',
  PATIENT: '/portal/registrations',
};
