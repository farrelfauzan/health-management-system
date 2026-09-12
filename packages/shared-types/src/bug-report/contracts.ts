import { BUG_REPORT_TEXT_FIELDS } from '#bug-report/schemas';

/**
 * Where a report stands, as the API reports it. Mirrors the Prisma
 * `BugReportStatus` enum.
 */
export type BugReportStatusValue = 'RECEIVED' | 'TRIAGED' | 'HELD' | 'PUBLISHED' | 'FAILED';

/**
 * What intake answers with (P23-T08).
 *
 * The reference and the status, and deliberately nothing else. There is no
 * Notion link here even once one exists: the Bug Board is Saling Jaga's
 * engineering record, not the clinic's, and handing a reporter a URL they
 * cannot open is worse than handing them nothing. The `BR-` reference is what
 * support asks for.
 */
export type BugReportSubmissionView = {
  reference: string;
  status: BugReportStatusValue;
};

/**
 * The per-field character counts recorded in the audit trail.
 *
 * Lengths, never text: the audit row exists to show that a report was filed and
 * roughly how much was written, and a report's text is the one thing that must
 * not be copied into a second table with a different retention rule.
 */
export type BugReportFieldLengths = Partial<
  Record<(typeof BUG_REPORT_TEXT_FIELDS)[number], number>
>;
