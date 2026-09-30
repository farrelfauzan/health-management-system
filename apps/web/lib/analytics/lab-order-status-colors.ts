import type { AnalyticsSeriesColor } from '#lib/analytics/analytics-filter-state';
import type { LabOrderOutcome } from '#lib/analytics/lab-order-outcome';

/** Fixed per outcome, so released is always the primary blue and cancelled always red. */
export const LAB_ORDER_STATUS_COLORS: Readonly<Record<LabOrderOutcome, AnalyticsSeriesColor>> = {
  released: { swatchClassName: 'bg-primary', fill: 'var(--color-primary)' },
  inProgress: { swatchClassName: 'bg-amber-500', fill: 'var(--color-amber-500, #f59e0b)' },
  sentOut: { swatchClassName: 'bg-slate-400', fill: 'var(--color-slate-400, #94a3b8)' },
  cancelled: { swatchClassName: 'bg-red-600', fill: 'var(--color-red-600, #dc2626)' },
};
