import type { TaxAssignmentKindValue, TaxDefaultTargetValue } from '#taxes/schemas';

const SERVICE_TARIFF_TARGETS: readonly TaxDefaultTargetValue[] = [
  'CONSULTATION',
  'PROCEDURE',
  'ACCOMMODATION',
  'LAB',
  'OTHER',
];

/**
 * Which category default an item falls back to: a tariff by its category, every
 * medication by the one medication row. A tariff category the tax module does
 * not know yet reads as `OTHER` rather than as no default at all.
 */
export function toTaxDefaultTarget(
  kind: TaxAssignmentKindValue,
  category: string | null,
): TaxDefaultTargetValue {
  if (kind === 'MEDICATION') {
    return 'MEDICATION';
  }
  return SERVICE_TARIFF_TARGETS.find((target) => target === category) ?? 'OTHER';
}
