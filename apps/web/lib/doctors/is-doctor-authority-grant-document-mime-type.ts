import {
  DOCTOR_AUTHORITY_GRANT_DOCUMENT_MIME_TYPES,
  type DoctorAuthorityGrantDocumentMimeTypeValue,
} from '@hms/shared-types';

/** Whether a picked file's type is one the grant document upload accepts. */
export function isDoctorAuthorityGrantDocumentMimeType(
  value: string,
): value is DoctorAuthorityGrantDocumentMimeTypeValue {
  return DOCTOR_AUTHORITY_GRANT_DOCUMENT_MIME_TYPES.some((allowed) => allowed === value);
}
