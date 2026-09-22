import type { NonCapitationServiceTypeValue } from '#bpjs-non-capitation/schemas';
import type { NonCapitationTariffSource } from '#bpjs-non-capitation/types';

/**
 * The tariff valid on the service date (P25-T16): the row of the service
 * type whose window holds the date, the latest-starting one should two
 * overlap. Null when none does — the line is shown unpriced, never at a
 * guessed figure.
 */
export function resolveNonCapitationTariff(params: {
  readonly tariffs: readonly NonCapitationTariffSource[];
  readonly serviceType: NonCapitationServiceTypeValue;
  readonly serviceDate: string;
}): NonCapitationTariffSource | null {
  const valid = params.tariffs.filter(
    (tariff) =>
      tariff.serviceType === params.serviceType &&
      tariff.validFrom <= params.serviceDate &&
      (tariff.validUntil === null || tariff.validUntil >= params.serviceDate),
  );
  const [latest] = [...valid].sort((left, right) => right.validFrom.localeCompare(left.validFrom));
  return latest ?? null;
}
