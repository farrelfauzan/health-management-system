import { MaternalReportKindValue } from '@hms/shared-types';

const TITLES: Readonly<Record<MaternalReportKindValue, string>> = {
  'kohort-ibu': 'Register Kohort Ibu',
  'kohort-bayi': 'Register Kohort Bayi',
  'kohort-kb': 'Register Kohort KB',
  'monthly-kia': 'Laporan Bulanan KIA',
  'births-deaths': 'Laporan Kelahiran dan Kematian',
};

/** The printed title of each register and report (P25-T15). */
export function resolveMaternalReportTitle(kind: MaternalReportKindValue): string {
  return TITLES[kind];
}
