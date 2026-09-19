/**
 * Raised when a new tax code collides with the unique `code`, so the service
 * answers 409 `TAX_CODE_CONFLICT` instead of letting a raw P2002 become a 500.
 */
export class TaxCodeConflictError extends Error {
  constructor() {
    super('A tax code with this code already exists');
    this.name = 'TaxCodeConflictError';
  }
}
