import { TaxReportKindValue, TaxReportPdfLayout } from '@hms/shared-types';

import { buildPp55ReportPdfSections } from './build-pp55-report-pdf-sections';
import { buildPph21ReportPdfSections } from './build-pph21-report-pdf-sections';
import { buildPpnOutputReportPdfSections } from './build-ppn-output-report-pdf-sections';

/**
 * Each report kind's title and sections in the tax report PDF (P27-T12). The
 * header, watermark and footer are shared; a new kind adds an entry here and
 * the compiler refuses to build until it does (PPh 21 did so in P27-T07).
 */
export const TAX_REPORT_PDF_LAYOUTS: Readonly<Record<TaxReportKindValue, TaxReportPdfLayout>> = {
  PP55_OMZET: { title: 'Draft Rekap PPh Final PP 55', buildSections: buildPp55ReportPdfSections },
  PPN_OUTPUT: { title: 'Draft Rekap PPN Keluaran', buildSections: buildPpnOutputReportPdfSections },
  PPH21_NON_EMPLOYEE: {
    title: 'Draft Rekap PPh 21 Bukan Pegawai',
    buildSections: buildPph21ReportPdfSections,
  },
};
