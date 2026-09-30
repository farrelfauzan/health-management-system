import type { AnalyticsSeriesColor } from '#lib/analytics/analytics-filter-state';
import type { PrescriptionFlowStatus } from '#lib/analytics/prescription-flow-status';

/** Fixed per outcome, so dispensed is always the primary blue and cancelled always red. */
export const PRESCRIPTION_FLOW_COLORS: Readonly<
  Record<PrescriptionFlowStatus, AnalyticsSeriesColor>
> = {
  fullyDispensed: { swatchClassName: 'bg-primary', fill: 'var(--color-primary)' },
  partiallyDispensed: { swatchClassName: 'bg-teal-700', fill: 'var(--color-teal-700, #0f766e)' },
  awaitingDispense: { swatchClassName: 'bg-amber-500', fill: 'var(--color-amber-500, #f59e0b)' },
  filledElsewhere: { swatchClassName: 'bg-slate-400', fill: 'var(--color-slate-400, #94a3b8)' },
  cancelled: { swatchClassName: 'bg-red-600', fill: 'var(--color-red-600, #dc2626)' },
};
