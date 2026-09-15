import {
  DOCTOR_AUTHORITY_DECREE_MIME_TYPES,
  type DoctorAuthorityDecreeMimeTypeValue,
} from '@hms/shared-types';

/** Whether a picked file's type is one the decree upload accepts. */
export function isDoctorAuthorityDecreeMimeType(
  value: string,
): value is DoctorAuthorityDecreeMimeTypeValue {
  return DOCTOR_AUTHORITY_DECREE_MIME_TYPES.some((allowed) => allowed === value);
}
