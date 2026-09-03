import { Writable } from 'node:stream';

import archiver from 'archiver';

import { DocumentRecord, VaultDocumentView } from '@hms/shared-types';

/** Compression level: fast, because most of a vault is already-compressed PDFs and JPEGs. */
const ZIP_COMPRESSION_LEVEL = 1;

export type WriteVaultDocumentArchiveParams = {
  readonly documents: readonly DocumentRecord[];
  readonly views: readonly VaultDocumentView[];
  readonly readObject: (storageKey: string) => Promise<Buffer>;
  readonly destination: Writable;
};

/**
 * Writes the caller's whole vault into a zip on `destination` (FR-E3-12).
 *
 * An export exists so that leaving the clinic does not mean leaving your own
 * paperwork behind, which is why it carries the files *and* a
 * `metadata.json`: a folder of `STR.pdf`, `Ijazah.pdf` with no record of
 * reference numbers or expiry dates is a worse copy of the vault than the one
 * being replaced.
 *
 * Entry names are derived from the document id rather than the title. Titles
 * are owner-supplied text and can collide, contain path separators, or be
 * empty after trimming — and a zip that silently overwrote one entry with
 * another would hand someone an incomplete archive that looks complete.
 */
export async function writeVaultDocumentArchive(
  params: WriteVaultDocumentArchiveParams,
): Promise<void> {
  const archive = archiver('zip', { zlib: { level: ZIP_COMPRESSION_LEVEL } });
  const completed = new Promise<void>((resolve, reject) => {
    archive.on('error', reject);
    archive.on('warning', reject);
    destinationSettled(params.destination, resolve, reject);
  });
  archive.pipe(params.destination);
  archive.append(JSON.stringify({ documents: params.views }, null, 2), {
    name: 'metadata.json',
  });
  for (const document of params.documents) {
    const body = await params.readObject(document.storageKey);
    archive.append(body, { name: `documents/${buildEntryName(document)}` });
  }
  await archive.finalize();
  await completed;
}

/**
 * The zip is done when the *destination* says so, not when `finalize()`
 * resolves: finalize only means every entry was queued, and returning before
 * the last byte is flushed truncates the response.
 */
function destinationSettled(
  destination: Writable,
  resolve: () => void,
  reject: (err: Error) => void,
): void {
  destination.on('close', resolve);
  destination.on('finish', resolve);
  destination.on('error', reject);
}

function buildEntryName(document: DocumentRecord): string {
  const extension = document.storageKey.includes('.')
    ? document.storageKey.slice(document.storageKey.lastIndexOf('.'))
    : '';
  return `${document.id}${extension}`;
}
