'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';
import { buildShellBreadcrumbRoot } from '#lib/navigation/build-shell-breadcrumb-root';
import { resolveBreadcrumbShell } from '#lib/navigation/resolve-breadcrumb-shell';

/**
 * The root crumb for whichever shell the current URL belongs to (SJ-161):
 * "Dashboard" linking to the admin home, or "Today" linking to the doctor's.
 * Client panels rendered by both shells call this instead of taking a prop,
 * so a page that mounts one needs no extra wiring to get the right root.
 */
export function useShellBreadcrumbRoot(): BreadcrumbTrailItem {
  const pathname = usePathname();
  const translateNavigation = useTranslations('authShell.shell.navigation');
  return buildShellBreadcrumbRoot({
    shell: resolveBreadcrumbShell(pathname),
    translateNavigation: (key) => translateNavigation(key),
  });
}
