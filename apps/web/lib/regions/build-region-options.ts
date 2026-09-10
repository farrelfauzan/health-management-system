import type { Region } from '@hms/shared-types';
import type { ComboboxOption } from '@hms/ui';

type BuildRegionOptionsParams = {
  regions: Region[];
  /**
   * The level's current selection as the patient record spells it. Prepended
   * when the fetched page does not contain it, which happens twice: while an
   * edit is still loading its lists, and after a village search whose results
   * no longer include the chosen row.
   */
  selected?: { code: string; name: string };
};

/**
 * Region rows as combobox options, with the current selection guaranteed to be
 * one of them so the trigger never falls back to a placeholder over a value
 * that is really set.
 */
export function buildRegionOptions({
  regions,
  selected,
}: BuildRegionOptionsParams): ComboboxOption[] {
  const options: ComboboxOption[] = regions.map((region) => ({
    value: region.code,
    label: region.name,
    keywords: [region.code],
  }));
  if (
    !selected ||
    selected.code === '' ||
    options.some((option) => option.value === selected.code)
  ) {
    return options;
  }
  return [{ value: selected.code, label: selected.name, keywords: [selected.code] }, ...options];
}
