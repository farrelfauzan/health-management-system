import { MaternalReportHeader } from '@hms/shared-types';

const MISSING_VALUE = '-';

/** The label/value block every CSV starts with: what, who, to whom, when. */
export function buildMaternalReportHeaderRows(
  title: string,
  header: MaternalReportHeader,
): string[][] {
  return [
    ['Laporan', title],
    ['Klinik', header.clinicName],
    ['Puskesmas', header.puskesmasName ?? MISSING_VALUE],
    ['Kode puskesmas', header.puskesmasCode ?? MISSING_VALUE],
    ['Bulan', header.monthLabel],
    ['Dicetak', header.generatedAt],
  ];
}
