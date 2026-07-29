/**
 * Raised when a DPHO code is already linked to a different medication — the
 * database unique constraint is the arbiter so two concurrent link calls
 * cannot both win.
 */
export class BpjsDphoCodeConflictError extends Error {
  constructor(readonly dphoCode: string) {
    super(`DPHO code ${dphoCode} is already linked to another medication`);
    this.name = 'BpjsDphoCodeConflictError';
  }
}
