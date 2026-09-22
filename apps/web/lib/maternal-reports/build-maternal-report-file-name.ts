import type { MaternalReportKindValue } from '@hms/shared-types';

const FILE_STEMS: Record<MaternalReportKindValue, string> = {
  'kohort-ibu': 'kohort-ibu',
  'kohort-bayi': 'kohort-bayi',
  'kohort-kb': 'kohort-kb',
  'monthly-kia': 'laporan-kia',
  'births-deaths': 'laporan-kelahiran-kematian',
};

type BuildMaternalReportFileNameParams = {
  kind: MaternalReportKindValue;
  month: string;
  villageCode: string | null;
  format: 'csv' | 'pdf';
};

/** `kohort-ibu-2026-10-32.73.11.1001.csv`: what the saved file is called. */
export function buildMaternalReportFileName({
  kind,
  month,
  villageCode,
  format,
}: BuildMaternalReportFileNameParams): string {
  const village = villageCode === null ? '' : `-${villageCode.replace(/[^0-9A-Za-z.]+/g, '')}`;
  return `${FILE_STEMS[kind]}-${month}${village}.${format}`;
}
