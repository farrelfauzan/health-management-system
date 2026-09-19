/** The tax page's `?tab=` slugs (P27-T03): the profile, the codes, and the code on each item. */
export const TAX_SETTINGS_TABS = ['profile', 'codes', 'assignments'] as const;

export type TaxSettingsTab = (typeof TAX_SETTINGS_TABS)[number];
