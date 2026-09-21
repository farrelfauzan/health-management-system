import { orvalAxiosMutator } from '#lib/api/http';
import { downloadTextFile } from '#lib/shared/download-text-file';

const CSV_MIME_TYPE = 'text/csv;charset=utf-8';

type ExportClinicianFeeStatementParams = {
  doctorId: string;
  period: string;
  doctorName: string;
};

function toFileSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Downloads one clinician's monthly jasa medis statement as CSV (P27-T06).
 * Through the axios mutator rather than the generated client, like the tax
 * report export: the response is a file and the generated client parses JSON.
 * The API audits the export.
 */
export async function exportClinicianFeeStatement({
  doctorId,
  period,
  doctorName,
}: ExportClinicianFeeStatementParams): Promise<void> {
  const response = await orvalAxiosMutator<string>({
    url: `/api/v1/clinician-fees/statements/${doctorId}/export`,
    method: 'GET',
    params: { period },
    responseType: 'text',
  });
  downloadTextFile({
    fileName: `jasa-medis-${period}-${toFileSlug(doctorName) || 'klinisi'}.csv`,
    content: response.data,
    mimeType: CSV_MIME_TYPE,
  });
}
