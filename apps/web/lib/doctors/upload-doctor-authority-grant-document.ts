import type {
  DoctorAuthorityGrantDocumentMimeTypeValue,
  DoctorAuthorityUploadUrlView,
} from '@hms/shared-types';

import { doctorAuthorityControllerCreateGrantDocumentUploadUrlV1 } from '#lib/api/generated/doctor-authorities/doctor-authorities';
import { parseApiSuccess } from '#lib/api/response';
import { putFileToSignedUrl } from '#lib/documents/put-file-to-signed-url';

type UploadDoctorAuthorityGrantDocumentParams = {
  doctorId: string;
  file: File;
  mimeType: DoctorAuthorityGrantDocumentMimeTypeValue;
};

/**
 * The first two steps of the grant document upload (P25-T02): ask HMS to sign a PUT
 * under `doctor-authorities/{doctorId}/`, then send the bytes straight to
 * storage. Returns the storage key for the create or update that follows —
 * that request is where the API reads the object back and records it.
 */
export async function uploadDoctorAuthorityGrantDocument({
  doctorId,
  file,
  mimeType,
}: UploadDoctorAuthorityGrantDocumentParams): Promise<string> {
  const signed = parseApiSuccess<DoctorAuthorityUploadUrlView>(
    await doctorAuthorityControllerCreateGrantDocumentUploadUrlV1(doctorId, {
      mimeType,
      sizeBytes: file.size,
    }),
    'Unable to start the upload.',
  );
  await putFileToSignedUrl(signed.data.url, file, { ...signed.data.requiredHeaders });
  return signed.data.storageKey;
}
