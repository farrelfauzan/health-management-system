import type { ShellNavigationKey } from '#lib/shell/nav-items';

/**
 * The shells whose pages carry a trail with a parent above them. The patient
 * portal is absent on purpose: its only headed page is its own home, so a
 * trail there has nothing to climb to.
 */
export type BreadcrumbShell = 'admin' | 'doctor';

type BreadcrumbShellRoot = {
  href: string;
  labelKey: ShellNavigationKey;
};

/**
 * Where every trail begins (SJ-161): the shell's home, named the way the
 * sidebar names it so the first crumb and the first nav entry read the same.
 * The hrefs are the ones `proxy.ts` sends a session to as its home; a
 * reduced admin session (pharmacist-only, technician-only) that follows the
 * admin root is bounced by the same gate to the page it may open.
 */
export const BREADCRUMB_SHELL_ROOTS: Record<BreadcrumbShell, BreadcrumbShellRoot> = {
  admin: { href: '/admin/dashboard', labelKey: 'dashboard' },
  doctor: { href: '/doctor/dashboard', labelKey: 'today' },
};
