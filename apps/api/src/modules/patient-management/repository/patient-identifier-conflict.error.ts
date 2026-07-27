/**
 * Raised when an identifier already belongs to another patient record. A NIK
 * collision is the moment two records are discovered to be the same person, so
 * callers route this to the duplicate-merge workflow rather than creating a
 * second record. An `mrn` collision can only come from the legacy-import path —
 * generated MRNs are allocated from a counter and cannot repeat.
 */
export class PatientIdentifierConflictError extends Error {
  constructor(
    readonly field: 'nik' | 'bpjsNumber' | 'mrn',
    readonly conflictingPatientId?: string,
  ) {
    super(`Patient identifier already in use: ${field}`);
    this.name = 'PatientIdentifierConflictError';
  }
}
