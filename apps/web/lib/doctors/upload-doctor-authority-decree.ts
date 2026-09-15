import type {
  DoctorAuthorityDecreeMimeTypeValue,
  DoctorAuthorityUploadUrlView,
} from '@hms/shared-types';

import { doctorAuthorityControllerCreateDecreeUploadUrlV1 } from '#lib/api/generated/doctor-authorities/doctor-authorities';
import { parseApiSuccess } from '#lib/api/response';
import { putFileToSignedUrl } from '#lib/documents/put-file-to-signed-url';

type UploadDoctorAuthorityDecreeParams = {
  doctorId: string;
  file: File;
  mimeType: DoctorAuthorityDecreeMimeTypeValue;
};

/**
 * The first two steps of the decree upload (P25-T02): ask HMS to sign a PUT
 * under `doctor-authorities/{doctorId}/`, then send the bytes straight to
 * storage. Returns the storage key for the create or update that follows —
 * that request is where the API reads the object back and records it.
 */
export async function uploadDoctorAuthorityDecree({
  doctorId,
  file,
  mimeType,
}: UploadDoctorAuthorityDecreeParams): Promise<string> {
  const signed = parseApiSuccess<DoctorAuthorityUploadUrlView>(
    await doctorAuthorityControllerCreateDecreeUploadUrlV1(doctorId, {
      mimeType,
      sizeBytes: file.size,
    }),
    'Unable to start the upload.',
  );
  await putFileToSignedUrl(signed.data.url, file, { ...signed.data.requiredHeaders });
  return signed.data.storageKey;
}
