import { DocumentRecord } from '@hms/shared-types';

import { Document } from '../../../generated/prisma/client';

/**
 * Maps one `documents` row to the repository projection every surface in this
 * module returns.
 *
 * Extracted from `DocumentRepository` when the vault (`P16-T16`) became the
 * second repository over this table: two private copies of this mapping would
 * drift the first time a column is added, and a column silently missing from
 * one surface's projection is the kind of bug that reads as a UI gap rather
 * than a data one.
 *
 * `chunkCount` is a parameter rather than a read: the callers that care join
 * it, and the callers that never ingest — clinical files, vault documents —
 * pass 0 rather than paying for a count that is always zero.
 *
 * `uploadedBy` is optional for the same reason (`P16-T14`): only the clinical
 * reads that display an uploader pay for the join, and the rest leave the
 * field null. It is a display hint, never a fact about the row — "not loaded"
 * and "no uploader" both read as null here.
 */
export function toDocumentRecord(
  row: Document & { uploadedBy?: { email: string } | null },
  chunkCount: number,
): DocumentRecord {
  return {
    id: row.id,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    purpose: row.purpose,
    title: row.title,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    visibility: row.visibility,
    language: row.language,
    ingestStatus: row.ingestStatus,
    ingestError: row.ingestError,
    ingestedAt: row.ingestedAt,
    chunkCount,
    uploadedById: row.uploadedById,
    uploadedByEmail: row.uploadedBy?.email ?? null,
    patientId: row.patientId,
    encounterId: row.encounterId,
    admissionId: row.admissionId,
    category: row.category,
    documentDate: row.documentDate,
    notes: row.notes,
    releasedToPatient: row.releasedToPatient,
    releasedAt: row.releasedAt,
    releasedById: row.releasedById,
    deleteReason: row.deleteReason,
    vaultCategory: row.vaultCategory,
    referenceNumber: row.referenceNumber,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
