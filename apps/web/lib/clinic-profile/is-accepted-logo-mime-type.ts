import {
  CLINIC_LOGO_UPLOAD_MIME_TYPES,
  type ClinicLogoUploadMimeTypeValue,
} from '@hms/shared-types';

/**
 * Whether the browser's reported type is one this surface accepts.
 *
 * A courtesy check, not a control: the file picker's `accept` attribute is a
 * hint and `File.type` is whatever the OS guessed. The API re-checks the
 * declared type before signing and then reads the bytes themselves at claim
 * time, so what this buys is a readable message instead of a round trip.
 */
export function isAcceptedLogoMimeType(value: string): value is ClinicLogoUploadMimeTypeValue {
  return CLINIC_LOGO_UPLOAD_MIME_TYPES.some((mimeType) => mimeType === value);
}
