/**
 * Raised when a catalog code or KFA code already belongs to another medication.
 * SATUSEHAT medication resources are keyed by KFA code, so a duplicate is always
 * a data error rather than a legitimate state.
 */
export class MedicationIdentifierConflictError extends Error {
  constructor(readonly field: 'code' | 'kfaCode') {
    super(`Medication identifier already in use: ${field}`);
    this.name = 'MedicationIdentifierConflictError';
  }
}
