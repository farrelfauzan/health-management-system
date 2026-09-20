import { DOCTOR_MANDATE_INSTRUCTION_KEY_ROOT } from '@hms/shared-types';

/**
 * Where a midwife's written instructions live in the bucket (P25-T05):
 * `doctor-mandates/{midwifeDoctorId}`. The clinician id is in the key so that
 * a key minted for one midwife can never be confirmed onto another's mandate —
 * the create route proves the caller-supplied key against this prefix.
 */
export function buildDoctorMandateInstructionKeyPrefix(midwifeDoctorId: string): string {
  return `${DOCTOR_MANDATE_INSTRUCTION_KEY_ROOT}/${midwifeDoctorId}`;
}
