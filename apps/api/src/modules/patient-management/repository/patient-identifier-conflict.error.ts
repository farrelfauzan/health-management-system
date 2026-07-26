/**
 * Raised when a national or payer identifier already belongs to another patient
 * record. A NIK collision is the moment two records are discovered to be the
 * same person, so callers route this to the duplicate-merge workflow rather
 * than creating a second record.
 */
export class PatientIdentifierConflictError extends Error {
  constructor(
    readonly field: 'nik' | 'bpjsNumber',
    readonly conflictingPatientId?: string,
  ) {
    super(`Patient identifier already in use: ${field}`);
    this.name = 'PatientIdentifierConflictError';
  }
}
