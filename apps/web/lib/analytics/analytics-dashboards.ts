import type { FeatureKey } from '@hms/shared-types';
import type { AppAction } from '@hms/ui';

export type AnalyticsDashboardSlug =
  'operations' | 'finance' | 'case-mix' | 'pharmacy' | 'laboratory' | 'reporting';

export type AnalyticsNavigationKey =
  | 'analyticsOperations'
  | 'analyticsFinance'
  | 'analyticsCaseMix'
  | 'analyticsPharmacy'
  | 'analyticsLaboratory'
  | 'analyticsReporting';

export type AnalyticsDashboard = {
  slug: AnalyticsDashboardSlug;
  href: string;
  label: string;
  labelKey: AnalyticsNavigationKey;
  icon: string;
  action: AppAction;
  /**
   * The module the dashboard reports on, when it is sold apart: with it
   * off there is nothing to show, so the entry hides and the API refuses.
   */
  requiredFeature?: FeatureKey;
};

/**
 * The "Analitik" sidebar group (P29-T01, D-050), in sidebar order. Each
 * dashboard opens on its own `analytics.read-*` key; the reporting status
 * page reads with the operations key, since it is about the clinic's
 * day-to-day rather than money or patients. The hrefs match the `analytics`
 * entry's `navHrefs` in the feature catalog.
 *
 * Pharmacy and laboratory read "Kinerja …" in the sidebar, not the bare
 * "Farmasi" and "Laboratorium" their pages are titled: the operational
 * menus already carry those names, and in the collapsed icon rail, where the
 * group heading is hidden, two identical tooltips would be a guess.
 */
export const ANALYTICS_DASHBOARDS: readonly AnalyticsDashboard[] = [
  {
    slug: 'operations',
    href: '/admin/analytics/operations',
    label: 'Operations',
    labelKey: 'analyticsOperations',
    icon: 'monitoring',
    action: 'read-operations',
  },
  {
    slug: 'finance',
    href: '/admin/analytics/finance',
    label: 'Finance',
    labelKey: 'analyticsFinance',
    icon: 'payments',
    action: 'read-finance',
  },
  {
    slug: 'case-mix',
    href: '/admin/analytics/case-mix',
    label: 'Case mix',
    labelKey: 'analyticsCaseMix',
    icon: 'stethoscope',
    action: 'read-clinical',
  },
  {
    slug: 'pharmacy',
    href: '/admin/analytics/pharmacy',
    label: 'Pharmacy performance',
    labelKey: 'analyticsPharmacy',
    icon: 'medication',
    action: 'read-pharmacy',
    requiredFeature: 'pharmacy',
  },
  {
    slug: 'laboratory',
    href: '/admin/analytics/laboratory',
    label: 'Lab performance',
    labelKey: 'analyticsLaboratory',
    icon: 'science',
    action: 'read-lab',
    requiredFeature: 'laboratory',
  },
  {
    slug: 'reporting',
    href: '/admin/analytics/reporting',
    label: 'Reporting status',
    labelKey: 'analyticsReporting',
    icon: 'cloud_sync',
    action: 'read-operations',
  },
];
