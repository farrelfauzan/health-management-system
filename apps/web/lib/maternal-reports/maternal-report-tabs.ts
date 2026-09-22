import type { MaternalReportKindValue } from '@hms/shared-types';

/** The report tabs (P25-T15), in strip order; each is one API route. */
export const MATERNAL_REPORT_TABS = [
  'kohort-ibu',
  'kohort-bayi',
  'kohort-kb',
  'monthly-kia',
  'births-deaths',
] as const satisfies readonly MaternalReportKindValue[];

export type MaternalReportTab = (typeof MATERNAL_REPORT_TABS)[number];
