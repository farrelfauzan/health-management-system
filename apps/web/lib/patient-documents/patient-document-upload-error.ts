/**
 * Which of the three upload steps failed. The dialog needs to know, because
 * the three failures want three different sentences: a signing failure is
 * "try again", a storage failure was already retried once with a fresh URL
 * before it reached the dialog, and a confirm failure means the bytes are in
 * the bucket but no row names them — the only remedy is to pick the file
 * again, and the person deserves to be told that rather than shown a generic
 * "upload failed" over a file that did in fact upload.
 */
export class PatientDocumentUploadError extends Error {
  readonly stage: 'sign' | 'put' | 'confirm';
  readonly reason: unknown;
  constructor(stage: 'sign' | 'put' | 'confirm', reason: unknown) {
    super(reason instanceof Error ? reason.message : `Patient document upload failed at ${stage}`);
    this.name = 'PatientDocumentUploadError';
    this.stage = stage;
    this.reason = reason;
  }
}
