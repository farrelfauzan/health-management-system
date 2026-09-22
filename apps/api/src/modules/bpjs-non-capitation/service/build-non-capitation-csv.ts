import { NonCapitationRecapResponse } from '@hms/shared-types';

import { buildMaternalReportCsv } from '../../maternal-reports/service/build-maternal-report-csv';
import { buildNonCapitationLineCells } from './build-non-capitation-line-cells';
import { NON_CAPITATION_FORMAT } from './format-non-capitation-values';
import { NON_CAPITATION_LINE_COLUMNS } from './non-capitation-line-columns';

/**
 * The month's recap as the CSV the induk attaches to its rekapitulasi
 * pelayanan (P25-T16; Peraturan BPJS 7/2018 Pasal 12 huruf a angka 2): a
 * header block, then one row per payable unit. The CSV writer is the KIA
 * reports' one — UTF-8 with BOM, CRLF, spreadsheet formulas neutralised.
 */
export function buildNonCapitationCsv(recap: NonCapitationRecapResponse): string {
  const induk = recap.settings.isConfigured
    ? `${recap.settings.networkParentProviderName ?? ''} (${recap.settings.networkParentProviderCode ?? ''})`
    : 'Belum diatur';
  return buildMaternalReportCsv([
    ['Rekap klaim non-kapitasi BPJS Kesehatan (bidan jejaring)'],
    ['Klinik', recap.clinicName],
    ['FKTP induk', induk],
    ['Bulan pelayanan', recap.monthLabel],
    ['Batas pengajuan ke FKTP induk', NON_CAPITATION_FORMAT.date(recap.filingDeadline)],
    ['Total', NON_CAPITATION_FORMAT.rupiah(recap.totalAmount)],
    ['Dicetak', recap.generatedAt],
    [],
    [...NON_CAPITATION_LINE_COLUMNS],
    ...recap.lines.map(buildNonCapitationLineCells),
  ]);
}
