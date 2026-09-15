import { DoctorAuthority, DoctorAuthorityRecord } from '@hms/shared-types';

import { resolveDoctorAuthorityStatus } from './resolve-doctor-authority-status';

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * The API shape of one authority (P25-T02). Storage columns are folded into
 * `hasDecree` — the key names a bucket path and never leaves the API.
 */
export function toDoctorAuthorityView(record: DoctorAuthorityRecord, today: Date): DoctorAuthority {
  return {
    id: record.id,
    doctorId: record.doctorId,
    kind: record.kind,
    trainingCertificateNumber: record.trainingCertificateNumber,
    decreeNumber: record.decreeNumber,
    decreeIssuedAt: toDateOnly(record.decreeIssuedAt),
    validFrom: toDateOnly(record.validFrom),
    validUntil: record.validUntil === null ? null : toDateOnly(record.validUntil),
    hasDecree: record.decreeStorageKey !== null,
    decreeMimeType: record.decreeMimeType,
    status: resolveDoctorAuthorityStatus(record, today),
    revokedAt: record.revokedAt === null ? null : record.revokedAt.toISOString(),
    revokeReason: record.revokeReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
