/** The lab order bench strip's `?tab=` slugs, in strip order (SJ-162). */
export const LAB_ORDER_TABS = ['specimens', 'results', 'documents', 'history'] as const;

export type LabOrderTab = (typeof LAB_ORDER_TABS)[number];
