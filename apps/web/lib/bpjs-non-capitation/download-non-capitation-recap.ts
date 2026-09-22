import { orvalAxiosMutator } from '#lib/api/http';
import { downloadTextFile } from '#lib/shared/download-text-file';
import { saveBlobFile } from '#lib/shared/save-blob-file';

const RECAP_URL = '/api/v1/bpjs/non-capitation/recap';
const CSV_MIME_TYPE = 'text/csv;charset=utf-8';

/**
 * Downloads the month's recap as the CSV or the PDF letter for the induk
 * (P25-T16). Through the axios mutator rather than the generated client, like
 * the KIA and tax exports: one route answers JSON, CSV or PDF by `format`, and
 * the generated client is typed for the JSON preview. The API audits it.
 */
export async function downloadNonCapitationRecap(params: {
  month: string;
  format: 'csv' | 'pdf';
}): Promise<void> {
  const fileName = `rekap-non-kapitasi-${params.month}.${params.format}`;
  const query = { month: params.month, format: params.format };
  if (params.format === 'csv') {
    const response = await orvalAxiosMutator<string>({
      url: RECAP_URL,
      method: 'GET',
      params: query,
      responseType: 'text',
    });
    downloadTextFile({ fileName, content: response.data, mimeType: CSV_MIME_TYPE });
    return;
  }
  const response = await orvalAxiosMutator<Blob>({
    url: RECAP_URL,
    method: 'GET',
    params: query,
    responseType: 'blob',
  });
  saveBlobFile({ blob: response.data, fileName });
}
