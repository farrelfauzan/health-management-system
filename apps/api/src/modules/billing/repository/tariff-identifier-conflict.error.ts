/**
 * Raised when a tariff write collides with the unique `code` or `icd9cmCode`
 * column, or with the one-live-price-per-audience rule behind consultation
 * tariffs, so the service can answer 409 naming what collided instead of
 * letting a raw P2002 surface as a 500.
 */
export class TariffIdentifierConflictError extends Error {
  constructor(public readonly field: 'code' | 'icd9cmCode' | 'consultationAudience') {
    super(
      field === 'consultationAudience'
        ? 'An active consultation tariff already prices this poli and profession'
        : `A service tariff with this ${field} already exists`,
    );
    this.name = 'TariffIdentifierConflictError';
  }
}
