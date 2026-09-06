export type ManagedDocumentUploadStage = 'sign' | 'put';

/**
 * Which step of the browser-direct upload failed, so the form can say
 * "the upload could not start" and "storage did not accept the file" as
 * two different sentences with two different remedies.
 */
export class ManagedDocumentUploadError extends Error {
  readonly stage: ManagedDocumentUploadStage;
  readonly reason: unknown;
  constructor(stage: ManagedDocumentUploadStage, reason: unknown) {
    super(reason instanceof Error ? reason.message : `Document upload failed at ${stage}`);
    this.name = 'ManagedDocumentUploadError';
    this.stage = stage;
    this.reason = reason;
  }
}
