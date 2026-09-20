import { TaxReportKindValue, TaxReportPdfLayout } from '@hms/shared-types';

import { buildPp55ReportPdfSections } from './build-pp55-report-pdf-sections';
import { buildPpnOutputReportPdfSections } from './build-ppn-output-report-pdf-sections';

/**
 * Each report kind's title and sections in the tax report PDF (P27-T12). The
 * header, watermark and footer are shared; PPh 21 (P27-T07) adds an entry
 * here and the compiler refuses to build until it does.
 */
export const TAX_REPORT_PDF_LAYOUTS: Readonly<Record<TaxReportKindValue, TaxReportPdfLayout>> = {
  PP55_OMZET: { title: 'Draft Rekap PPh Final PP 55', buildSections: buildPp55ReportPdfSections },
  PPN_OUTPUT: { title: 'Draft Rekap PPN Keluaran', buildSections: buildPpnOutputReportPdfSections },
};
