import type { TaxReportPdfDownloadView, TaxReportView } from '@hms/shared-types';

import {
  taxReportControllerCreatePdfDownloadUrlV1,
  taxReportControllerRenderPdfV1,
} from '#lib/api/generated/tax-reports/tax-reports';
import { parseApiSuccess } from '#lib/api/response';
import { saveBlobFile } from '#lib/shared/save-blob-file';

type DownloadTaxReportPdfParams = Pick<TaxReportView, 'id' | 'period' | 'kind' | 'status'>;

/**
 * Downloads one monthly tax report as PDF (P27-T12). A finalized report has a
 * stored file, reached through a short-lived signed link fetched at click
 * time; a draft is rendered fresh, with its DRAFT watermark, and saved from
 * the response. The API audits both.
 */
export async function downloadTaxReportPdf(report: DownloadTaxReportPdfParams): Promise<void> {
  if (report.status === 'FINALIZED') {
    const link = parseApiSuccess<TaxReportPdfDownloadView>(
      await taxReportControllerCreatePdfDownloadUrlV1(report.id),
      'Unable to download the PDF.',
    );
    window.location.assign(link.data.url);
    return;
  }
  const response = await taxReportControllerRenderPdfV1(report.id);
  const kind = report.kind.toLowerCase().replaceAll('_', '-');
  saveBlobFile({ blob: response.data, fileName: `pajak-${kind}-${report.period}-draft.pdf` });
}
