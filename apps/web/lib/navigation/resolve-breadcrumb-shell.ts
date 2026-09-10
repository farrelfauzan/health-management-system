import type { BreadcrumbShell } from '#lib/navigation/breadcrumb-shell';

const DOCTOR_PATH_PREFIX = '/doctor';

/**
 * Which shell a path renders in, read the way `proxy.ts` reads it: by the
 * first segment. Panels shared between the admin and doctor shells decide
 * their root from this rather than from a prop, because the shell is a fact
 * about the URL and not about the data the panel shows. A missing path (a
 * component rendered outside the App Router, as in a test) is the admin shell.
 */
export function resolveBreadcrumbShell(pathname: string | null): BreadcrumbShell {
  if (pathname === null) {
    return 'admin';
  }
  const isDoctorPath =
    pathname === DOCTOR_PATH_PREFIX || pathname.startsWith(`${DOCTOR_PATH_PREFIX}/`);
  return isDoctorPath ? 'doctor' : 'admin';
}
