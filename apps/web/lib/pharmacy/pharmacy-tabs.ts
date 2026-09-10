/** The pharmacy strip's `?tab=` slugs, in strip order (SJ-162). */
export const PHARMACY_TABS = ['queue', 'inventory'] as const;

export type PharmacyTab = (typeof PHARMACY_TABS)[number];
