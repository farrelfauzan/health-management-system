import { orvalAxiosMutator } from '#lib/api/http';
import { downloadTextFile } from '#lib/shared/download-text-file';

const CSV_MIME_TYPE = 'text/csv;charset=utf-8';

type ExportTaxReportParams = {
  reportId: string;
  period: string;
  kind: string;
};

/**
 * Downloads one monthly tax report as CSV (P27-T05). Through the axios mutator
 * rather than the generated client, like the documents export: the response is
 * a file and the generated client parses JSON. The API audits the export.
 */
export async function exportTaxReport({
  reportId,
  period,
  kind,
}: ExportTaxReportParams): Promise<void> {
  const response = await orvalAxiosMutator<string>({
    url: `/api/v1/tax/reports/${reportId}/export`,
    method: 'GET',
    responseType: 'text',
  });
  downloadTextFile({
    fileName: `pajak-${kind.toLowerCase().replaceAll('_', '-')}-${period}.csv`,
    content: response.data,
    mimeType: CSV_MIME_TYPE,
  });
}
