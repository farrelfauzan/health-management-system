import type { TaxCategoryDefaultView, TaxDefaultTargetValue } from '@hms/shared-types';

/** The defaults form's state: the chosen code id per target, `''` for none. */
export type TaxDefaultSelection = Partial<Record<TaxDefaultTargetValue, string>>;

/** The stored defaults as the form's starting position. */
export function toTaxDefaultSelection(defaults: TaxCategoryDefaultView[]): TaxDefaultSelection {
  return Object.fromEntries(defaults.map((entry) => [entry.target, entry.taxCodeId ?? '']));
}
