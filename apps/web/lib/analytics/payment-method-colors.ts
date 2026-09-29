import type { PaymentMethodValue } from '@hms/shared-types';

import type { AnalyticsSeriesColor } from '#lib/analytics/analytics-filter-state';

/** Fixed per method, so a method keeps its colour whatever else is on the chart. */
export const PAYMENT_METHOD_COLORS: Readonly<Record<PaymentMethodValue, AnalyticsSeriesColor>> = {
  CASH: { swatchClassName: 'bg-primary', fill: 'var(--color-primary)' },
  QRIS: { swatchClassName: 'bg-orange-700', fill: 'var(--color-orange-700, #c2410c)' },
  TRANSFER: { swatchClassName: 'bg-teal-700', fill: 'var(--color-teal-700, #0f766e)' },
  INSURANCE: { swatchClassName: 'bg-violet-700', fill: 'var(--color-violet-700, #6d28d9)' },
};
