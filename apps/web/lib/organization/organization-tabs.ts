/** The org chart screen's `?tab=` slugs: the tree table and the diagram (SJ-162). */
export const ORGANIZATION_TABS = ['list', 'chart'] as const;

export type OrganizationTab = (typeof ORGANIZATION_TABS)[number];
