import type {
  DocumentTemplateImportUploadUrlView,
  DocumentTemplateImportView,
} from '@hms/shared-types';

import {
  documentTemplateControllerCreateImportUploadUrlV1,
  documentTemplateControllerImportTemplateV1,
} from '#lib/api/generated/document-templates/document-templates';
import { parseApiSuccess } from '#lib/api/response';
import { putFileToSignedUrl } from '#lib/documents/put-file-to-signed-url';

type ImportDocumentTemplateParams = {
  templateId: string;
  file: File;
  uploadErrorMessage: string;
  importErrorMessage: string;
};

/**
 * Word → editor draft (P16-T42): sign a staged upload, PUT the file straight
 * to storage, then ask the API to convert it. The result is loaded into the
 * editor, not saved — the author reviews and presses Save.
 */
export async function importDocumentTemplate({
  templateId,
  file,
  uploadErrorMessage,
  importErrorMessage,
}: ImportDocumentTemplateParams): Promise<DocumentTemplateImportView> {
  const signed = parseApiSuccess<DocumentTemplateImportUploadUrlView>(
    await documentTemplateControllerCreateImportUploadUrlV1({ sizeBytes: file.size }),
    uploadErrorMessage,
  );
  await putFileToSignedUrl(signed.data.url, file, signed.data.requiredHeaders);
  const imported = parseApiSuccess<DocumentTemplateImportView>(
    await documentTemplateControllerImportTemplateV1(templateId, {
      stagedKey: signed.data.storageKey,
    }),
    importErrorMessage,
  );
  return imported.data;
}
