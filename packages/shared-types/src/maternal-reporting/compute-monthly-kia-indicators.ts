import type { MonthlyKiaIndicatorValue } from '#maternal-reporting/contracts';
import type { MonthlyKiaIndicatorDefinition, MonthlyKiaSource } from '#maternal-reporting/types';

/** Runs one indicator set over a month's source and keeps the layout order. */
export function computeMonthlyKiaIndicators(
  definitions: readonly MonthlyKiaIndicatorDefinition[],
  source: MonthlyKiaSource,
): MonthlyKiaIndicatorValue[] {
  return definitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    definition: definition.definition,
    value: definition.compute(source),
  }));
}
