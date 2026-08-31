import type { ClinicLogoUploadMimeTypeValue } from '@hms/shared-types';

import { clinicProfileControllerCreateLogoUploadUrlV1 } from '#lib/api/generated/clinic-profile/clinic-profile';
import { parseApiSuccess } from '#lib/api/response';
import { putFileToSignedUrl } from '#lib/documents/put-file-to-signed-url';

type UploadClinicLogoParams = {
  file: File;
  mimeType: ClinicLogoUploadMimeTypeValue;
};

type SignedUpload = {
  url: string;
  storageKey: string;
  requiredHeaders: Record<string, string>;
};

/**
 * Stages a logo and returns the key that claims it.
 *
 * Two steps here, not three: the browser asks HMS to sign an upload and PUTs
 * the bytes straight to storage, and that is all this function does. Claiming
 * the staged object is the profile's own PATCH — which is what makes the
 * logo part of one save rather than a separate act, so an administrator who
 * picks a file and then abandons the form has changed nothing.
 */
export async function uploadClinicLogo({
  file,
  mimeType,
}: UploadClinicLogoParams): Promise<string> {
  const signed = parseApiSuccess<SignedUpload>(
    await clinicProfileControllerCreateLogoUploadUrlV1({ mimeType, sizeBytes: file.size }),
    'Unable to start the logo upload.',
  );
  await putFileToSignedUrl(signed.data.url, file, signed.data.requiredHeaders);
  return signed.data.storageKey;
}
