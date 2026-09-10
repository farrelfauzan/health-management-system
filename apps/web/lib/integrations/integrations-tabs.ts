/** The integrations strip's `?tab=` slugs, in strip order (SJ-162). */
export const INTEGRATIONS_TABS = ['monitor', 'settings', 'antrean', 'mappings'] as const;

export type IntegrationsTab = (typeof INTEGRATIONS_TABS)[number];
