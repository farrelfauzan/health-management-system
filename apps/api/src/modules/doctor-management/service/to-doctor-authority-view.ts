import { DoctorAuthority, DoctorAuthorityRecord } from '@hms/shared-types';

import { resolveDoctorAuthorityStatus } from './resolve-doctor-authority-status';

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * The API shape of one authority (P25-T02, D-036). Storage columns are folded into
 * `hasGrantDocument` — the key names a bucket path and never leaves the API.
 */
export function toDoctorAuthorityView(record: DoctorAuthorityRecord, today: Date): DoctorAuthority {
  return {
    id: record.id,
    doctorId: record.doctorId,
    kind: record.kind,
    grantKind: record.grantKind,
    trainingCertificateNumber: record.trainingCertificateNumber,
    grantReference: record.grantReference,
    grantIssuedAt: toDateOnly(record.grantIssuedAt),
    validFrom: toDateOnly(record.validFrom),
    validUntil: toDateOnly(record.validUntil),
    hasGrantDocument: record.grantDocumentStorageKey !== null,
    grantDocumentMimeType: record.grantDocumentMimeType,
    status: resolveDoctorAuthorityStatus(record, today),
    revokedAt: record.revokedAt === null ? null : record.revokedAt.toISOString(),
    revokeReason: record.revokeReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
