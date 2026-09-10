import type { DocumentLanguageValue } from '@hms/shared-types';

import { isAcceptedDocumentMimeType } from '#lib/documents/is-accepted-document-mime-type';
import { UnsupportedDocumentTypeError } from '#lib/documents/unsupported-document-type-error';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';
import { uploadPersonalDocument } from '#lib/personal-documents/upload-personal-document';

type PersonalDocumentBatchItem = {
  file: File;
  title: string;
};

type PersonalDocumentBatchItemResult = {
  index: number;
  outcome: 'recorded' | 'failed';
  error: unknown;
};

type UploadPersonalDocumentBatchParams = {
  items: PersonalDocumentBatchItem[];
  language: DocumentLanguageValue;
  onItemProgress?: (index: number, progress: DocumentUploadProgress) => void;
  onItemSettled?: (result: PersonalDocumentBatchItemResult) => void;
  uploadOne?: typeof uploadPersonalDocument;
};

async function executeOne(
  params: UploadPersonalDocumentBatchParams,
  index: number,
): Promise<PersonalDocumentBatchItemResult> {
  const item = params.items[index];
  if (!item) {
    return { index, outcome: 'failed', error: new Error('No file at this position') };
  }
  const mimeType = item.file.type;
  if (!isAcceptedDocumentMimeType(mimeType)) {
    return { index, outcome: 'failed', error: new UnsupportedDocumentTypeError(item.file.name) };
  }
  const uploadOne = params.uploadOne ?? uploadPersonalDocument;
  try {
    await uploadOne({
      file: item.file,
      title: item.title,
      mimeType,
      language: params.language,
      onProgress: (progress) => params.onItemProgress?.(index, progress),
    });
    return { index, outcome: 'recorded', error: null };
  } catch (err) {
    return { index, outcome: 'failed', error: err };
  }
}

/**
 * Uploads a picked batch of knowledge-base documents one file at a time, and
 * never stops early (`P19-T14`).
 *
 * The same shape as the patient-documents batch and for the same reasons.
 * Sequential rather than parallel because the dialog narrates one progress bar
 * per file, and a clinic connection uploading ten guidelines at once shows ten
 * bars crawling instead of one moving. The order is the pick order, so the
 * person watches the list fill from the top.
 *
 * A failure settles its own row and the loop moves on. Aborting on the first
 * error would leave someone who picked ten files with three recorded, one
 * failed, and six never attempted, and no way to tell the last two groups
 * apart. Every row reports its own outcome and the caller decides what to
 * offer for the failed ones — here, leaving them in place so pressing upload
 * again retries only those.
 *
 * `language` is batch-wide: it is a property of the corpus being seeded, not
 * of the individual file, and the ingest pipeline reads it per document only
 * to pick a tokenizer.
 */
export async function uploadPersonalDocumentBatch(
  params: UploadPersonalDocumentBatchParams,
): Promise<PersonalDocumentBatchItemResult[]> {
  const results: PersonalDocumentBatchItemResult[] = [];
  for (let i = 0; i < params.items.length; i += 1) {
    const result = await executeOne(params, i);
    params.onItemSettled?.(result);
    results.push(result);
  }
  return results;
}
