/**
 * Raised when a practitioner NIK already belongs to another doctor record.
 * SATUSEHAT resolves practitioners by NIK, so two doctors sharing one is always
 * a data error rather than a legitimate state.
 */
export class DoctorIdentifierConflictError extends Error {
  constructor(readonly field: 'nik') {
    super(`Doctor identifier already in use: ${field}`);
    this.name = 'DoctorIdentifierConflictError';
  }
}
