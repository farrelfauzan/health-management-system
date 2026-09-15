import { DOCTOR_AUTHORITY_GRANT_DOCUMENT_KEY_ROOT } from '@hms/shared-types';

/**
 * Where a clinician's grant documents live in the bucket (P25-T02):
 * `doctor-authorities/{doctorId}`. The clinician id is in the key so that a
 * key minted for one midwife can never be confirmed onto another's row — the
 * create and update routes prove the caller-supplied key against this prefix.
 */
export function buildDoctorAuthorityGrantDocumentKeyPrefix(doctorId: string): string {
  return `${DOCTOR_AUTHORITY_GRANT_DOCUMENT_KEY_ROOT}/${doctorId}`;
}
