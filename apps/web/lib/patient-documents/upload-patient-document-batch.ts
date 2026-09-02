import type { DocumentCategoryValue } from '@hms/shared-types';

import { isAcceptedDocumentMimeType } from '#lib/documents/is-accepted-document-mime-type';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';
import { PatientDocumentUploadError } from '#lib/patient-documents/patient-document-upload-error';
import { uploadPatientDocument } from '#lib/patient-documents/upload-patient-document';

type PatientDocumentBatchItem = {
  file: File;
  title: string;
};

type PatientDocumentBatchSharedFields = {
  category: DocumentCategoryValue;
  documentDate?: string;
  notes?: string;
  encounterId?: string;
  admissionId?: string;
};

type PatientDocumentBatchItemResult = {
  index: number;
  outcome: 'recorded' | 'already-recorded' | 'failed';
  error: unknown;
};

type UploadPatientDocumentBatchParams = {
  patientId: string;
  items: PatientDocumentBatchItem[];
  shared: PatientDocumentBatchSharedFields;
  onItemProgress?: (index: number, progress: DocumentUploadProgress) => void;
  onItemSettled?: (result: PatientDocumentBatchItemResult) => void;
  uploadOne?: typeof uploadPatientDocument;
};

async function executeOne(
  params: UploadPatientDocumentBatchParams,
  index: number,
): Promise<PatientDocumentBatchItemResult> {
  const item = params.items[index];
  if (!item) {
    return { index, outcome: 'failed', error: new Error('No file at this position') };
  }
  const mimeType = item.file.type;
  if (!isAcceptedDocumentMimeType(mimeType)) {
    return {
      index,
      outcome: 'failed',
      error: new PatientDocumentUploadError('sign', new Error('Unsupported file type')),
    };
  }
  const uploadOne = params.uploadOne ?? uploadPatientDocument;
  try {
    const result = await uploadOne({
      patientId: params.patientId,
      file: item.file,
      mimeType,
      title: item.title,
      ...params.shared,
      onProgress: (progress) => params.onItemProgress?.(index, progress),
    });
    return { index, outcome: result.outcome, error: null };
  } catch (err) {
    return { index, outcome: 'failed', error: err };
  }
}

/**
 * Uploads a picked batch one file at a time, and never stops early.
 *
 * Sequential rather than parallel because the dialog narrates one progress
 * bar per file and a clinic connection uploading four scans at once shows
 * four bars crawling instead of one moving. The order is the pick order, so
 * the person watches the list fill from the top.
 *
 * A failure settles its own row and the loop moves on. The alternative —
 * abort on the first error — would leave a person who picked six files with
 * two recorded, one failed, and three that were never tried, and no way to
 * tell the last two groups apart. Every row reports its own outcome and the
 * caller decides what to offer for the failed ones.
 */
export async function uploadPatientDocumentBatch(
  params: UploadPatientDocumentBatchParams,
): Promise<PatientDocumentBatchItemResult[]> {
  const results: PatientDocumentBatchItemResult[] = [];
  for (let i = 0; i < params.items.length; i += 1) {
    const result = await executeOne(params, i);
    params.onItemSettled?.(result);
    results.push(result);
  }
  return results;
}
