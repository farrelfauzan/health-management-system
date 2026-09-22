import type { MaternalReportTab } from '#lib/maternal-reports/maternal-report-tabs';

/** Locale keys under `maternalCare.reports.tabs` — message keys cannot carry a hyphen. */
export const MATERNAL_REPORT_TAB_LABEL_KEYS = {
  'kohort-ibu': 'kohortIbu',
  'kohort-bayi': 'kohortBayi',
  'kohort-kb': 'kohortKb',
  'monthly-kia': 'monthlyKia',
  'births-deaths': 'birthsDeaths',
} as const satisfies Record<MaternalReportTab, string>;
