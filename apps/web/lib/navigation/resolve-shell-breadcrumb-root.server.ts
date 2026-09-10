import { getTranslations } from 'next-intl/server';

import type { BreadcrumbShell } from '#lib/navigation/breadcrumb-shell';
import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';
import { buildShellBreadcrumbRoot } from '#lib/navigation/build-shell-breadcrumb-root';

/**
 * The root crumb for a server component (SJ-161), which knows its shell from
 * the route file it lives in and cannot call the client hook. Same label and
 * href as `useShellBreadcrumbRoot`, resolved through `getTranslations`.
 */
export async function resolveShellBreadcrumbRoot(
  shell: BreadcrumbShell = 'admin',
): Promise<BreadcrumbTrailItem> {
  const translateNavigation = await getTranslations('authShell.shell.navigation');
  return buildShellBreadcrumbRoot({
    shell,
    translateNavigation: (key) => translateNavigation(key),
  });
}
