import { DoctorAuthorityKindValue, MIDWIFE_AUTHORITY_REQUIRED_ERROR_CODE } from '@hms/shared-types';
import { UnprocessableEntityException } from '@nestjs/common';

/**
 * The 422 every midwife-authority refusal answers with (P25-T03), in one place
 * so the encounter gate and the KB gate (P25-T14) cannot drift: the web reads
 * `details.kind` to say which authority is missing.
 */
export function buildMidwifeAuthorityRequiredException(
  kind: DoctorAuthorityKindValue,
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: MIDWIFE_AUTHORITY_REQUIRED_ERROR_CODE,
    message: `This midwife holds no active ${kind} authority (PP 28/2024 Pasal 744); refer the patient to a doctor or a puskesmas`,
    errors: { kind },
  });
}
