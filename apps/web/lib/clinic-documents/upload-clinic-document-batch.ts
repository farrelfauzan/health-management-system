import type {
  CorpusDocumentPurposeValue,
  DocumentLanguageValue,
  DocumentVisibilityValue,
} from '@hms/shared-types';

import { uploadClinicDocument } from '#lib/clinic-documents/upload-clinic-document';
import { isAcceptedDocumentMimeType } from '#lib/documents/is-accepted-document-mime-type';
import { UnsupportedDocumentTypeError } from '#lib/documents/unsupported-document-type-error';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';

type ClinicDocumentBatchItem = {
  file: File;
  title: string;
};

type ClinicDocumentBatchItemResult = {
  index: number;
  outcome: 'recorded' | 'failed';
  error: unknown;
};

type UploadClinicDocumentBatchParams = {
  items: ClinicDocumentBatchItem[];
  purpose: CorpusDocumentPurposeValue;
  visibility: DocumentVisibilityValue;
  language: DocumentLanguageValue;
  onItemProgress?: (index: number, progress: DocumentUploadProgress) => void;
  onItemSettled?: (result: ClinicDocumentBatchItemResult) => void;
  uploadOne?: typeof uploadClinicDocument;
};

async function executeOne(
  params: UploadClinicDocumentBatchParams,
  index: number,
): Promise<ClinicDocumentBatchItemResult> {
  const item = params.items[index];
  if (!item) {
    return { index, outcome: 'failed', error: new Error('No file at this position') };
  }
  const mimeType = item.file.type;
  if (!isAcceptedDocumentMimeType(mimeType)) {
    return { index, outcome: 'failed', error: new UnsupportedDocumentTypeError(item.file.name) };
  }
  const uploadOne = params.uploadOne ?? uploadClinicDocument;
  try {
    await uploadOne({
      file: item.file,
      title: item.title,
      mimeType,
      purpose: params.purpose,
      visibility: params.visibility,
      language: params.language,
      onProgress: (progress) => params.onItemProgress?.(index, progress),
    });
    return { index, outcome: 'recorded', error: null };
  } catch (err) {
    return { index, outcome: 'failed', error: err };
  }
}

/**
 * Uploads a picked batch of clinic-corpus documents one file at a time, and
 * never stops early (`P19-T15`).
 *
 * The same shape as the knowledge-base batch and for the same reasons.
 * Sequential rather than parallel because the dialog narrates one progress bar
 * per file, and a clinic connection uploading ten SOPs at once shows ten bars
 * crawling instead of one moving. The order is the pick order, so the person
 * watches the list fill from the top.
 *
 * A failure settles its own row and the loop moves on. Aborting on the first
 * error would leave someone who picked ten files with three recorded, one
 * failed, and six never attempted, and no way to tell the last two groups
 * apart. Every row reports its own outcome and the caller decides what to
 * offer for the failed ones — here, leaving them in place so pressing upload
 * again retries only those.
 *
 * `purpose`, `visibility` and `language` are batch-wide. Language describes
 * the corpus being seeded rather than the individual file, and visibility is a
 * decision about the whole folder someone arrived with: a person loading the
 * patient-facing FAQ is loading a patient-facing FAQ, not sorting twenty files
 * one at a time. Anything that landed under the wrong audience is corrected
 * from the table afterwards, one row at a time, which is the rare case.
 */
export async function uploadClinicDocumentBatch(
  params: UploadClinicDocumentBatchParams,
): Promise<ClinicDocumentBatchItemResult[]> {
  const results: ClinicDocumentBatchItemResult[] = [];
  for (let i = 0; i < params.items.length; i += 1) {
    const result = await executeOne(params, i);
    params.onItemSettled?.(result);
    results.push(result);
  }
  return results;
}
