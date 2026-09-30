import type { AnalyticsPayerTypeValue } from '@hms/shared-types';

import type { AnalyticsSeriesColor } from '#lib/analytics/analytics-filter-state';

/** One colour per payer; "not recorded" is the neutral grey, never a payer's colour. */
export const PAYER_TYPE_COLORS: Readonly<
  Record<AnalyticsPayerTypeValue | 'notRecorded', AnalyticsSeriesColor>
> = {
  GENERAL: { swatchClassName: 'bg-primary', fill: 'var(--color-primary)' },
  BPJS: { swatchClassName: 'bg-teal-700', fill: 'var(--color-teal-700, #0f766e)' },
  INSURANCE: { swatchClassName: 'bg-violet-700', fill: 'var(--color-violet-700, #6d28d9)' },
  notRecorded: { swatchClassName: 'bg-slate-300', fill: 'var(--color-slate-300, #cbd5e1)' },
};
