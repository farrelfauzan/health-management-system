import type { AppAction } from '@hms/ui';

export type AnalyticsDashboardSlug =
  | 'operations'
  | 'finance'
  | 'case-mix'
  | 'pharmacy'
  | 'laboratory'
  | 'reporting';

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
};

/**
 * The "Analitik" sidebar group (P29-T01, D-050), in sidebar order. Each
 * dashboard opens on its own `analytics.read-*` key; the reporting status
 * page reads with the operations key, since it is about the clinic's
 * day-to-day rather than money or patients. The hrefs match the `analytics`
 * entry's `navHrefs` in the feature catalog.
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
    label: 'Pharmacy',
    labelKey: 'analyticsPharmacy',
    icon: 'medication',
    action: 'read-pharmacy',
  },
  {
    slug: 'laboratory',
    href: '/admin/analytics/laboratory',
    label: 'Laboratory',
    labelKey: 'analyticsLaboratory',
    icon: 'science',
    action: 'read-lab',
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
