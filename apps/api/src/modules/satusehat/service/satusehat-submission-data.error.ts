/**
 * A submission failed because the clinical record itself cannot be reported —
 * a missing NIK, an unlinked profile with no master-index match, a vanished
 * encounter. Always terminal: retrying cannot fix data, only people can, so
 * the worker marks the row FAILED with this message for the ops surface.
 */
export class SatusehatSubmissionDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SatusehatSubmissionDataError';
  }
}
