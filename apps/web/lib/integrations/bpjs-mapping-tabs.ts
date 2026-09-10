/**
 * The BPJS mappings strip's `?mapping=` slugs (SJ-162). Its own key, not
 * `tab`, because the strip sits inside the integrations page's own strip
 * (`?tab=mappings`) and the two must compose in one URL.
 */
export const BPJS_MAPPING_TABS = ['doctors', 'specialties', 'medications'] as const;

export type BpjsMappingTab = (typeof BPJS_MAPPING_TABS)[number];
