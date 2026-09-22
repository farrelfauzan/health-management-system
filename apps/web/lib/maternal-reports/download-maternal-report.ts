import type { MaternalReportKindValue } from '@hms/shared-types';

import { orvalAxiosMutator } from '#lib/api/http';
import { buildMaternalReportFileName } from '#lib/maternal-reports/build-maternal-report-file-name';
import { downloadTextFile } from '#lib/shared/download-text-file';
import { saveBlobFile } from '#lib/shared/save-blob-file';

const CSV_MIME_TYPE = 'text/csv;charset=utf-8';

type DownloadMaternalReportParams = {
  kind: MaternalReportKindValue;
  month: string;
  villageCode: string | null;
  format: 'csv' | 'pdf';
};

/**
 * Downloads one register or report as the file the puskesmas takes (P25-T15).
 * Through the axios mutator rather than the generated client, like the tax
 * and fee exports: the same route answers JSON, CSV or PDF by `format`, and
 * the generated client is typed for the JSON preview. The API audits it.
 */
export async function downloadMaternalReport(params: DownloadMaternalReportParams): Promise<void> {
  const url = `/api/v1/maternal-reports/${params.kind}`;
  const query = {
    month: params.month,
    format: params.format,
    ...(params.villageCode === null ? {} : { villageCode: params.villageCode }),
  };
  const fileName = buildMaternalReportFileName(params);
  if (params.format === 'csv') {
    const response = await orvalAxiosMutator<string>({
      url,
      method: 'GET',
      params: query,
      responseType: 'text',
    });
    downloadTextFile({ fileName, content: response.data, mimeType: CSV_MIME_TYPE });
    return;
  }
  const response = await orvalAxiosMutator<Blob>({
    url,
    method: 'GET',
    params: query,
    responseType: 'blob',
  });
  saveBlobFile({ blob: response.data, fileName });
}
