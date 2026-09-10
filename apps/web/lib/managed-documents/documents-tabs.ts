/** The documents module strip's `?tab=` slugs, in strip order (SJ-162). */
export const DOCUMENTS_TABS = ['registry', 'approvals', 'types'] as const;

export type DocumentsTab = (typeof DOCUMENTS_TABS)[number];
