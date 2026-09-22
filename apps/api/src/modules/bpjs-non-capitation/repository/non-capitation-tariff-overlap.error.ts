/**
 * Raised when a new tariff would start on or before an existing row of the
 * same service type. A tariff history only grows forward: correcting a past
 * figure is a data fix, not an admin edit, because lines already sent were
 * priced with it.
 */
export class NonCapitationTariffOverlapError extends Error {
  constructor(readonly serviceType: string) {
    super(`A ${serviceType} tariff already starts on or after this date`);
    this.name = 'NonCapitationTariffOverlapError';
  }
}
