/** The laboratory catalog strip's `?tab=` slugs: single tests and panels (SJ-162). */
export const LAB_CATALOG_TABS = ['tests', 'panels'] as const;

export type LabCatalogTab = (typeof LAB_CATALOG_TABS)[number];
