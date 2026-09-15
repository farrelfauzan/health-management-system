/**
 * Raised when the partial unique index on `doctor_authorities` refuses a
 * second live authority of one kind (P25-T02). The service pre-checks the
 * same rule; this is the race where two grants pass the pre-check together,
 * and the service maps both to the same 409.
 */
export class DoctorAuthorityConflictError extends Error {
  constructor() {
    super('A live authority of this kind already exists for this clinician');
    this.name = 'DoctorAuthorityConflictError';
  }
}
