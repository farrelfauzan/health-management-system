import { orvalAxiosMutator } from '#lib/api/http';
import type { ManagedDocumentFilters } from '#lib/managed-documents/managed-document-filters';
import { toManagedDocumentQueryParams } from '#lib/managed-documents/managed-document-filters';
import { downloadTextFile } from '#lib/shared/download-text-file';

const CSV_MIME_TYPE = 'text/csv;charset=utf-8';

/**
 * Downloads the *currently filtered* registry as CSV (FR-E5-07).
 *
 * Goes through the axios mutator rather than the generated client for the
 * same reason the vault export does: the response is a file, and the
 * generated client parses JSON. The mutator is still what carries the auth
 * header and the 401 handling.
 *
 * It sends the same filters the table is showing, so the export and the
 * screen it was taken from can never disagree — and the API audits it as an
 * explicit export with those filters and the row count (NFR-PRIV-01).
 */
export async function exportManagedDocuments(filters: ManagedDocumentFilters): Promise<void> {
  const response = await orvalAxiosMutator<string>({
    url: '/api/v1/documents/export',
    method: 'GET',
    params: toManagedDocumentQueryParams(filters),
    responseType: 'text',
  });
  downloadTextFile({
    fileName: buildFileName(),
    content: response.data,
    mimeType: CSV_MIME_TYPE,
  });
}

function buildFileName(): string {
  return `documents-${new Date().toISOString().slice(0, 10)}.csv`;
}
