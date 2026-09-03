import { DocumentRecord, VaultDocumentView } from '@hms/shared-types';

/**
 * The owner-facing projection of one vault document (`P16-T17`).
 *
 * A module-level function rather than a private method because the export
 * archive needs the same shape the API returns — the `metadata.json` inside
 * the zip and the JSON on the wire describing the same document must not be
 * two independently-maintained mappings that drift.
 *
 * `ownerId` and `storageKey` are absent by construction: this surface
 * addresses exactly one vault, so echoing whose it is would answer a question
 * the API never lets anyone ask, and every download is a signed URL minted
 * per request rather than a key a client holds.
 */
export function toVaultDocumentView(record: DocumentRecord): VaultDocumentView {
  return {
    id: record.id,
    title: record.title,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    language: record.language,
    vaultCategory: record.vaultCategory,
    referenceNumber: record.referenceNumber,
    issuedAt: toIsoDate(record.issuedAt),
    expiresAt: toIsoDate(record.expiresAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toIsoDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}
