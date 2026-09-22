/** The integrations strip's `?tab=` slugs, in strip order (SJ-162). */
export const INTEGRATIONS_TABS = [
  'monitor',
  'settings',
  'antrean',
  // P25-T16. Next to the BPJS panels, like the ticket asks.
  'non-capitation',
  'mappings',
  'locations',
] as const;

export type IntegrationsTab = (typeof INTEGRATIONS_TABS)[number];
