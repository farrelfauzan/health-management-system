export const BILLING_TABS = ['invoices', 'tariffs', 'report', 'templates'] as const;

export type BillingTab = (typeof BILLING_TABS)[number];

export function isBillingTab(value: string): value is BillingTab {
  return BILLING_TABS.some((tab) => tab === value);
}
