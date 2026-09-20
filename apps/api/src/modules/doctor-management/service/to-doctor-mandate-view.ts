import {
  DELEGATION_MAX_ABSENCE_DAYS,
  DELEGATION_MIN_ABSENCE_DAYS,
  DoctorMandate,
  DoctorMandatePolicyWarningValue,
  DoctorMandateRecord,
} from '@hms/shared-types';

import { resolveDoctorAuthorityStatus } from './resolve-doctor-authority-status';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Rules that inform rather than refuse (D-036 §3). The revoked Pasal 27's
 * "same FKTP" and "never continuous" tests are no longer hard law, and PP
 * 28/2024 Pasal 745(3)'s 1–3 month absence describes a delegation rather than
 * bounding it — so a window outside that is worth saying out loud and is not
 * something this code may adjudicate.
 */
function collectPolicyWarnings(
  record: DoctorMandateRecord,
  overlappingCount: number,
): DoctorMandatePolicyWarningValue[] {
  const warnings: DoctorMandatePolicyWarningValue[] = [];
  const spanDays =
    (record.validUntil.getTime() - record.validFrom.getTime()) / MILLISECONDS_PER_DAY + 1;
  if (
    record.kind === 'DELEGATION' &&
    (spanDays < DELEGATION_MIN_ABSENCE_DAYS || spanDays > DELEGATION_MAX_ABSENCE_DAYS)
  ) {
    warnings.push('DELEGATION_OUTSIDE_ABSENCE_WINDOW');
  }
  if (overlappingCount > 0) {
    warnings.push('OVERLAPS_EXISTING_MANDATE');
  }
  return warnings;
}

/**
 * The API shape of one pelimpahan (P25-T05). The storage key never leaves the
 * API — it names a bucket path — so only the type of the instruction file is
 * exposed, alongside the download route that serves it.
 */
export function toDoctorMandateView(
  record: DoctorMandateRecord,
  today: Date,
  overlappingCount = 0,
): DoctorMandate {
  return {
    id: record.id,
    midwifeDoctorId: record.midwifeDoctorId,
    mandatingDoctorId: record.mandatingDoctorId,
    mandatingDoctorName: record.mandatingDoctorName,
    kind: record.kind,
    instruction: record.instruction,
    icd9cmCodes: record.icd9cmCodes,
    validFrom: toDateOnly(record.validFrom),
    validUntil: toDateOnly(record.validUntil),
    instructionMimeType: record.instructionMimeType,
    status: resolveDoctorAuthorityStatus(record, today),
    policyWarnings: collectPolicyWarnings(record, overlappingCount),
    revokedAt: record.revokedAt === null ? null : record.revokedAt.toISOString(),
    revokeReason: record.revokeReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
