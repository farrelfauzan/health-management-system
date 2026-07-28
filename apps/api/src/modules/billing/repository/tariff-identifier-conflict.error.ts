/**
 * Raised when a tariff write collides with the unique `code` or `icd9cmCode`
 * column, so the service can answer 409 with the offending field instead of
 * letting a raw P2002 surface as a 500.
 */
export class TariffIdentifierConflictError extends Error {
  constructor(public readonly field: 'code' | 'icd9cmCode') {
    super(`A service tariff with this ${field} already exists`);
    this.name = 'TariffIdentifierConflictError';
  }
}
