/** The tax reports page's `?view=` slugs: a table per report (the default) or the month cards. */
export const TAX_REPORTS_VIEWS = ['table', 'cards'] as const;

export type TaxReportsView = (typeof TAX_REPORTS_VIEWS)[number];
