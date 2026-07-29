/**
 * A submission that cannot be built because the clinical record or its BPJS
 * mappings are incomplete. Always classified permanent: retrying cannot fix
 * data, only people can — the message is written for the admin who reads it
 * off the submissions monitor.
 */
export class BpjsSubmissionDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BpjsSubmissionDataError';
  }
}
