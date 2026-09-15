import { DOCTOR_AUTHORITY_DECREE_KEY_ROOT } from '@hms/shared-types';

/**
 * Where a clinician's decision letters live in the bucket (P25-T02):
 * `doctor-authorities/{doctorId}`. The clinician id is in the key so that a
 * key minted for one midwife can never be confirmed onto another's row — the
 * confirm step proves the caller-supplied key against this prefix.
 */
export function buildDoctorAuthorityDecreeKeyPrefix(doctorId: string): string {
  return `${DOCTOR_AUTHORITY_DECREE_KEY_ROOT}/${doctorId}`;
}
