import { orvalAxiosMutator } from '#lib/api/http';

const VAULT_EXPORT_FILENAME = 'vault-export.zip';

/**
 * Downloads the caller's whole vault as a zip (FR-E3-12).
 *
 * The one binary response in this API — every other download is a signed URL
 * — so it cannot go through the generated client, which parses JSON. It goes
 * through the same axios mutator regardless, because that is what carries the
 * auth header and the 401 handling; asking for a `blob` is the only
 * difference.
 *
 * Leaving the clinic should not mean leaving your own paperwork behind, and
 * the archive carries the reference numbers and dates alongside the files:
 * a bag of PDFs without them would be a worse copy than the one being
 * replaced.
 */
export async function exportVault(): Promise<void> {
  const response = await orvalAxiosMutator<Blob>({
    url: '/api/v1/me/vault-documents/export',
    method: 'GET',
    responseType: 'blob',
  });
  const objectUrl = URL.createObjectURL(response.data);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = VAULT_EXPORT_FILENAME;
    link.click();
  } finally {
    // Revoked in a `finally` so a click handler that throws does not leak the
    // blob for the life of the tab.
    URL.revokeObjectURL(objectUrl);
  }
}
