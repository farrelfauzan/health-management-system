import { BREADCRUMB_SHELL_ROOTS, type BreadcrumbShell } from '#lib/navigation/breadcrumb-shell';
import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';
import type { ShellNavigationKey } from '#lib/shell/nav-items';

type BuildShellBreadcrumbRootOptions = {
  shell: BreadcrumbShell;
  translateNavigation: (key: ShellNavigationKey) => string;
};

/**
 * The first crumb of a trail: the shell's home, labelled with the sidebar's
 * word for it. Takes the translator as a function so the same builder serves
 * a server component (`getTranslations`) and a client one (`useTranslations`).
 */
export function buildShellBreadcrumbRoot({
  shell,
  translateNavigation,
}: BuildShellBreadcrumbRootOptions): BreadcrumbTrailItem {
  const root = BREADCRUMB_SHELL_ROOTS[shell];
  return { label: translateNavigation(root.labelKey), href: root.href };
}
