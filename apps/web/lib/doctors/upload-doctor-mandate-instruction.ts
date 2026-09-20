import type {
  DoctorAuthorityGrantDocumentMimeTypeValue,
  DoctorAuthorityUploadUrlView,
} from '@hms/shared-types';

import { doctorMandateControllerCreateInstructionUploadUrlV1 } from '#lib/api/generated/doctor-mandates/doctor-mandates';
import { parseApiSuccess } from '#lib/api/response';
import { putFileToSignedUrl } from '#lib/documents/put-file-to-signed-url';

type UploadDoctorMandateInstructionParams = {
  doctorId: string;
  file: File;
  mimeType: DoctorAuthorityGrantDocumentMimeTypeValue;
};

/**
 * The first two steps of the written-instruction upload (P25-T05): ask HMS to
 * sign a PUT under `doctor-mandates/{doctorId}/`, then send the bytes straight
 * to storage. Returns the storage key for the create that follows — that
 * request is where the API reads the object back and records it. Unlike an
 * authority's grant document, the file is required: a pelimpahan is written
 * (PP 28/2024 Pasal 745 ayat (2)).
 */
export async function uploadDoctorMandateInstruction({
  doctorId,
  file,
  mimeType,
}: UploadDoctorMandateInstructionParams): Promise<string> {
  const signed = parseApiSuccess<DoctorAuthorityUploadUrlView>(
    await doctorMandateControllerCreateInstructionUploadUrlV1(doctorId, {
      mimeType,
      sizeBytes: file.size,
    }),
    'Unable to start the upload.',
  );
  await putFileToSignedUrl(signed.data.url, file, { ...signed.data.requiredHeaders });
  return signed.data.storageKey;
}
