import type { TemplateVariable } from '@hms/shared-types';

/**
 * Palette search over token, both labels and the sample value (FR-E1-03):
 * "mrn" finds `patient.mrn` by token, "rekam" by its Indonesian label, and
 * "RM-000142" by what the value looks like on a printed receipt.
 */
export function filterTemplateVariables(
  variables: readonly TemplateVariable[],
  query: string,
): TemplateVariable[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return [...variables];
  }
  return variables.filter((variable) =>
    [variable.token, variable.labelId, variable.labelEn, variable.sample].some((haystack) =>
      haystack.toLowerCase().includes(needle),
    ),
  );
}
