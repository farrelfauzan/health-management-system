/** The billing strip's `?tab=` slugs, in strip order (SJ-156, SJ-162). */
export const BILLING_TABS = ['invoices', 'tariffs', 'report', 'templates'] as const;

export type BillingTab = (typeof BILLING_TABS)[number];
